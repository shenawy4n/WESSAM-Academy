/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { ServiceError, toServiceError } from '../../lib/errors/serviceError';

export type RealtimeScope = 'notifications' | 'messages';

export type RealtimeChannelStatus =
  | 'SUBSCRIBING'
  | 'SUBSCRIBED'
  | 'CHANNEL_ERROR'
  | 'TIMED_OUT'
  | 'CLOSED';

export interface PostgresChangeFilterSpec {
  event: '*' | 'INSERT' | 'UPDATE' | 'DELETE';
  schema: string;
  table: string;
  filter?: string;
}

export interface RealtimeChangePayload {
  schema?: string;
  table?: string;
  eventType?: string;
  commit_timestamp?: string;
  new?: Record<string, unknown> | null;
  old?: Record<string, unknown> | null;
  errors?: unknown;
}

export interface RealtimeListener {
  onUpdate: (payload: RealtimeChangePayload) => void;
  onError?: (error: ServiceError) => void;
  onStatusChange?: (status: RealtimeChannelStatus) => void;
}

export interface RealtimeSubscriptionHandle {
  unsubscribe: () => void;
  retry: () => void;
  getStatus: () => RealtimeChannelStatus;
}

interface HubEntry {
  key: string;
  client: SupabaseClient;
  scope: RealtimeScope;
  userId: string;
  baseTopic: string;
  filters: PostgresChangeFilterSpec[];
  channel: RealtimeChannel;
  listeners: Set<RealtimeListener>;
  status: RealtimeChannelStatus;
  lastError: ServiceError | null;
  disposed: boolean;
  recentEventTimestamps: Map<string, number>;
}

const EVENT_DEDUP_WINDOW_MS = 5000;
const MAX_DEDUP_CACHE_SIZE = 200;

export function buildRealtimeEventDedupKey(
  table: string,
  payload: RealtimeChangePayload
): string | null {
  const newRow = payload.new && typeof payload.new === 'object' ? payload.new : null;
  const oldRow = payload.old && typeof payload.old === 'object' ? payload.old : null;
  const rowId =
    (newRow?.id as string | undefined) ||
    (oldRow?.id as string | undefined) ||
    (newRow?.notification_id as string | undefined) ||
    (oldRow?.notification_id as string | undefined);
  const eventType = payload.eventType || '*';
  const commitTs = payload.commit_timestamp || '';

  if (!rowId || !commitTs) {
    return null;
  }

  const readState =
    newRow && 'is_read' in newRow ? String(Boolean(newRow.is_read)) : '';

  return `${table}:${eventType}:${rowId}:${commitTs}:${readState}`;
}

export class RealtimeSubscriptionManager {
  private readonly entriesByClient = new WeakMap<SupabaseClient, Map<string, HubEntry>>();
  private channelSeq = 0;

  private getClientMap(client: SupabaseClient): Map<string, HubEntry> {
    let map = this.entriesByClient.get(client);
    if (!map) {
      map = new Map<string, HubEntry>();
      this.entriesByClient.set(client, map);
    }
    return map;
  }

  private resolveFreshChannelTopic(client: SupabaseClient, baseTopic: string): string {
    const existingChannels =
      typeof (client as { getChannels?: () => RealtimeChannel[] }).getChannels === 'function'
        ? client.getChannels()
        : [];

    const expectedPrefixedTopic = `realtime:${baseTopic}`;
    let hasTopicConflict = false;

    for (const ch of existingChannels) {
      if (ch && ch.topic === expectedPrefixedTopic) {
        hasTopicConflict = true;
        try {
          Promise.resolve(client.removeChannel(ch)).catch(() => {
            // Best-effort cleanup of stale channel before allocating a fresh topic
          });
        } catch {
          // Ignore cleanup errors on stale channel
        }
      }
    }

    if (hasTopicConflict) {
      this.channelSeq += 1;
      return `${baseTopic}_${this.channelSeq}`;
    }

    return baseTopic;
  }

  private createAndSubscribeChannel(entry: HubEntry): RealtimeChannel {
    const topic = this.resolveFreshChannelTopic(entry.client, entry.baseTopic);
    const channel = entry.client.channel(topic);

    // Register EVERY postgres_changes listener BEFORE calling subscribe()
    for (const filterSpec of entry.filters) {
      channel.on(
        'postgres_changes',
        {
          event: filterSpec.event,
          schema: filterSpec.schema,
          table: filterSpec.table,
          ...(filterSpec.filter ? { filter: filterSpec.filter } : {}),
        } as any,
        (payload: RealtimeChangePayload) => {
          if (entry.disposed || entry.channel !== channel) {
            return;
          }

          const dedupKey = buildRealtimeEventDedupKey(filterSpec.table, payload);
          const now = Date.now();
          if (dedupKey) {
            const seenAt = entry.recentEventTimestamps.get(dedupKey);
            if (seenAt !== undefined && now - seenAt < EVENT_DEDUP_WINDOW_MS) {
              return;
            }
            entry.recentEventTimestamps.set(dedupKey, now);
            if (entry.recentEventTimestamps.size > MAX_DEDUP_CACHE_SIZE) {
              for (const [k, ts] of entry.recentEventTimestamps) {
                if (now - ts >= EVENT_DEDUP_WINDOW_MS) {
                  entry.recentEventTimestamps.delete(k);
                }
              }
            }
          }

          for (const listener of Array.from(entry.listeners)) {
            if (entry.disposed) break;
            try {
              listener.onUpdate(payload);
            } catch {
              // Isolate listener errors from breaking peer subscribers
            }
          }
        }
      );
    }

    entry.status = 'SUBSCRIBING';
    entry.channel = channel;

    channel.subscribe((status, err) => {
      if (entry.disposed || entry.channel !== channel) {
        return;
      }

      if (status === 'SUBSCRIBED') {
        entry.status = 'SUBSCRIBED';
        entry.lastError = null;
        for (const listener of Array.from(entry.listeners)) {
          listener.onStatusChange?.('SUBSCRIBED');
        }
        return;
      }

      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        const nextStatus: RealtimeChannelStatus =
          status === 'TIMED_OUT'
            ? 'TIMED_OUT'
            : status === 'CLOSED'
            ? 'CLOSED'
            : 'CHANNEL_ERROR';
        entry.status = nextStatus;

        const baseErr =
          err ||
          new Error(
            nextStatus === 'TIMED_OUT'
              ? 'Realtime subscription timed out'
              : nextStatus === 'CLOSED'
              ? 'Realtime subscription connection closed'
              : 'Realtime subscription channel error'
          );

        const rawError = toServiceError(baseErr, {
          service: `realtime:${entry.scope}`,
          operation: `subscribe:${entry.scope}`,
          fallbackMessage: `Failed to maintain realtime ${entry.scope} connection`,
        });

        const serviceError = new ServiceError({
          category: nextStatus === 'TIMED_OUT' ? 'NETWORK_ERROR' : rawError.category,
          message: rawError.message,
          service: rawError.service,
          operation: rawError.operation,
          code: rawError.code,
          status: rawError.status,
          details: rawError.details,
          hint: rawError.hint,
          isRetryable: true,
          originalError: rawError.originalError,
        });

        entry.lastError = serviceError;

        for (const listener of Array.from(entry.listeners)) {
          listener.onStatusChange?.(nextStatus);
          listener.onError?.(serviceError);
        }
      }
    });

    return channel;
  }

  subscribe(params: {
    client: SupabaseClient;
    scope: RealtimeScope;
    userId: string;
    baseTopic: string;
    filters: PostgresChangeFilterSpec[];
    listener: RealtimeListener;
  }): RealtimeSubscriptionHandle {
    const { client, scope, userId, baseTopic, filters, listener } = params;
    const entryKey = `${scope}:${userId}`;
    const clientMap = this.getClientMap(client);

    let entry = clientMap.get(entryKey);
    if (!entry || entry.disposed) {
      entry = {
        key: entryKey,
        client,
        scope,
        userId,
        baseTopic,
        filters,
        channel: undefined as unknown as RealtimeChannel,
        listeners: new Set([listener]),
        status: 'SUBSCRIBING',
        lastError: null,
        disposed: false,
        recentEventTimestamps: new Map(),
      };
      clientMap.set(entryKey, entry);
      this.createAndSubscribeChannel(entry);
    } else {
      entry.listeners.add(listener);
      listener.onStatusChange?.(entry.status);
      if (entry.lastError && entry.status !== 'SUBSCRIBED') {
        listener.onError?.(entry.lastError);
      }
    }

    const activeEntry = entry;
    let unsubscribed = false;

    return {
      unsubscribe: () => {
        if (unsubscribed) return;
        unsubscribed = true;

        activeEntry.listeners.delete(listener);
        if (activeEntry.listeners.size === 0 && !activeEntry.disposed) {
          activeEntry.disposed = true;
          if (clientMap.get(entryKey) === activeEntry) {
            clientMap.delete(entryKey);
          }
          try {
            Promise.resolve(client.removeChannel(activeEntry.channel)).catch(() => {
              // Cleanup only
            });
          } catch {
            // Cleanup only
          }
        }
      },
      retry: () => {
        this.retry(client, scope, userId);
      },
      getStatus: () => activeEntry.status,
    };
  }

  retry(client: SupabaseClient, scope: RealtimeScope, userId: string): void {
    const entryKey = `${scope}:${userId}`;
    const clientMap = this.getClientMap(client);
    const entry = clientMap.get(entryKey);
    if (!entry || entry.disposed || entry.listeners.size === 0) {
      return;
    }

    const oldChannel = entry.channel;
    entry.lastError = null;
    try {
      Promise.resolve(client.removeChannel(oldChannel)).catch(() => {
        // Ignore cleanup errors during retry
      });
    } catch {
      // Ignore cleanup errors during retry
    }

    this.createAndSubscribeChannel(entry);
  }

  getActiveChannelCount(client: SupabaseClient, scope?: RealtimeScope, userId?: string): number {
    const clientMap = this.entriesByClient.get(client);
    if (!clientMap) return 0;

    let count = 0;
    for (const entry of clientMap.values()) {
      if (entry.disposed) continue;
      if (scope && entry.scope !== scope) continue;
      if (userId && entry.userId !== userId) continue;
      count += 1;
    }
    return count;
  }

  getSubscriberCount(client: SupabaseClient, scope: RealtimeScope, userId: string): number {
    const entry = this.entriesByClient.get(client)?.get(`${scope}:${userId}`);
    if (!entry || entry.disposed) return 0;
    return entry.listeners.size;
  }
}

export const realtimeManager = new RealtimeSubscriptionManager();
