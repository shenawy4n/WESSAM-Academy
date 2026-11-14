/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setSupabaseClientForTesting } from '../../lib/supabase/client';
import { ServiceError } from '../../lib/errors/serviceError';
import { notificationService } from './notificationService';
import {
  realtimeManager,
  RealtimeChangePayload,
  RealtimeChannelStatus,
  buildRealtimeEventDedupKey,
} from './realtimeManager';

interface MockChannel {
  topic: string;
  baseTopic: string;
  subscribed: boolean;
  calls: string[];
  postgresCallbacks: Array<{
    filter: { event: string; schema: string; table: string; filter?: string };
    cb: (payload: RealtimeChangePayload) => void;
  }>;
  subscribeCb?: (status: RealtimeChannelStatus, err?: Error) => void;
  on: (type: string, filter: any, cb: (payload: RealtimeChangePayload) => void) => MockChannel;
  subscribe: (cb?: (status: RealtimeChannelStatus, err?: Error) => void) => MockChannel;
  emitChange: (payload: RealtimeChangePayload) => void;
  emitStatus: (status: RealtimeChannelStatus, err?: Error) => void;
}

function createMockRealtimeSupabaseClient(options?: { deferRemoveChannel?: boolean }) {
  const channels = new Map<string, MockChannel>();
  const createdChannels: MockChannel[] = [];
  const removeChannelCalls: string[] = [];

  const client: any = {
    getChannels() {
      return Array.from(channels.values());
    },
    channel(topic: string) {
      const prefixed = topic.startsWith('realtime:') ? topic : `realtime:${topic}`;
      const existing = channels.get(prefixed);
      if (existing) {
        return existing;
      }

      const ch: MockChannel = {
        topic: prefixed,
        baseTopic: topic,
        subscribed: false,
        calls: [],
        postgresCallbacks: [],
        on(type: string, filter: any, cb: (payload: RealtimeChangePayload) => void) {
          // Reproduce exact Supabase Realtime JS invariant error
          if (ch.subscribed) {
            throw new Error(
              `cannot add postgres_changes callbacks for ${ch.topic} after subscribe().`
            );
          }
          ch.calls.push(`on:${type}:${filter.table}:${filter.filter || '*'}`);
          ch.postgresCallbacks.push({ filter, cb });
          return ch;
        },
        subscribe(cb?: (status: RealtimeChannelStatus, err?: Error) => void) {
          ch.calls.push('subscribe');
          ch.subscribed = true;
          ch.subscribeCb = cb;
          return ch;
        },
        emitChange(payload: RealtimeChangePayload) {
          for (const entry of ch.postgresCallbacks) {
            entry.cb(payload);
          }
        },
        emitStatus(status: RealtimeChannelStatus, err?: Error) {
          ch.subscribeCb?.(status, err);
        },
      };

      channels.set(prefixed, ch);
      createdChannels.push(ch);
      return ch;
    },
    async removeChannel(ch: MockChannel) {
      if (!ch) return 'ok';
      removeChannelCalls.push(ch.topic);
      if (options?.deferRemoveChannel) {
        await Promise.resolve();
      }
      if (channels.get(ch.topic) === ch) {
        channels.delete(ch.topic);
      }
      return 'ok';
    },
  };

  return {
    client,
    createdChannels,
    removeChannelCalls,
    getActiveMapSize: () => channels.size,
  };
}

afterEach(() => {
  setSupabaseClientForTesting(null);
});

describe('Realtime Notification Subscription Lifecycle', () => {
  it('1. Registers all postgres_changes listeners strictly BEFORE subscribe()', () => {
    const mock = createMockRealtimeSupabaseClient();
    setSupabaseClientForTesting(mock.client);

    const unsub = notificationService.subscribeToNotifications('user-1', () => {});
    assert.equal(mock.createdChannels.length, 1);

    const ch = mock.createdChannels[0];
    assert.equal(ch.calls[0], 'on:postgres_changes:notification_recipients:recipient_id=eq.user-1');
    assert.equal(ch.calls[1], 'subscribe');
    assert.equal(ch.subscribed, true);

    unsub();
  });

  it('2. Shares one scoped channel across NotificationBell and NotificationCenterView without adding listeners after subscribe()', () => {
    const mock = createMockRealtimeSupabaseClient();
    setSupabaseClientForTesting(mock.client);

    let bellCalls = 0;
    let centerCalls = 0;

    const unsubBell = notificationService.subscribeToNotifications('user-525', () => {
      bellCalls += 1;
    });
    const unsubCenter = notificationService.subscribeToNotifications('user-525', () => {
      centerCalls += 1;
    });

    // Must create only 1 channel for user-525 and never call .on() after .subscribe()
    assert.equal(mock.createdChannels.length, 1);
    assert.equal(realtimeManager.getActiveChannelCount(mock.client, 'notifications', 'user-525'), 1);
    assert.equal(realtimeManager.getSubscriberCount(mock.client, 'notifications', 'user-525'), 2);

    const ch = mock.createdChannels[0];
    ch.emitStatus('SUBSCRIBED');
    ch.emitChange({
      eventType: 'INSERT',
      table: 'notification_recipients',
      commit_timestamp: '2026-11-13T10:00:00Z',
      new: { id: 'nr-1', recipient_id: 'user-525', is_read: false },
    });

    assert.equal(bellCalls, 1);
    assert.equal(centerCalls, 1);

    // Unmounting first subscriber keeps channel alive for the second
    unsubBell();
    assert.equal(mock.removeChannelCalls.length, 0);
    assert.equal(realtimeManager.getSubscriberCount(mock.client, 'notifications', 'user-525'), 1);

    ch.emitChange({
      eventType: 'INSERT',
      table: 'notification_recipients',
      commit_timestamp: '2026-11-13T10:00:02Z',
      new: { id: 'nr-2', recipient_id: 'user-525', is_read: false },
    });
    assert.equal(bellCalls, 1);
    assert.equal(centerCalls, 2);

    // Unmounting last subscriber tears down the channel
    unsubCenter();
    assert.equal(mock.removeChannelCalls.length, 1);
    assert.equal(realtimeManager.getActiveChannelCount(mock.client, 'notifications', 'user-525'), 0);
  });

  it('3. Handles StrictMode rapid unmount/remount cleanly even while old removeChannel is still closing asynchronously', async () => {
    const mock = createMockRealtimeSupabaseClient({ deferRemoveChannel: true });
    setSupabaseClientForTesting(mock.client);

    const unsub1 = notificationService.subscribeToNotifications('user-strict', () => {});
    unsub1(); // removeChannel awaits Promise tick before deleting from client.getChannels()

    let updates = 0;
    const unsub2 = notificationService.subscribeToNotifications('user-strict', () => {
      updates += 1;
    });

    assert.equal(mock.createdChannels.length, 2);
    assert.notEqual(mock.createdChannels[1].topic, mock.createdChannels[0].topic);
    assert.equal(mock.createdChannels[1].calls[0].startsWith('on:postgres_changes:'), true);
    assert.equal(mock.createdChannels[1].calls[1], 'subscribe');

    // Old channel event must be ignored as stale
    mock.createdChannels[0].emitChange({
      eventType: 'INSERT',
      commit_timestamp: '2026-11-13T10:00:05Z',
      new: { id: 'stale-row' },
    });
    assert.equal(updates, 0);

    // New channel event triggers update
    mock.createdChannels[1].emitChange({
      eventType: 'INSERT',
      commit_timestamp: '2026-11-13T10:00:06Z',
      new: { id: 'fresh-row' },
    });
    assert.equal(updates, 1);

    unsub2();
    await Promise.resolve();
  });

  it('4. Separates channels cleanly on account change (userA -> userB)', () => {
    const mock = createMockRealtimeSupabaseClient();
    setSupabaseClientForTesting(mock.client);

    let userAUpdates = 0;
    let userBUpdates = 0;

    const unsubA = notificationService.subscribeToNotifications('user-A', () => {
      userAUpdates += 1;
    });
    unsubA();

    const unsubB = notificationService.subscribeToNotifications('user-B', () => {
      userBUpdates += 1;
    });

    assert.equal(mock.createdChannels.length, 2);
    assert.equal(mock.createdChannels[0].topic, 'realtime:user_notifications_user-A');
    assert.equal(mock.createdChannels[1].topic, 'realtime:user_notifications_user-B');
    assert.equal(mock.removeChannelCalls.length, 1);

    mock.createdChannels[0].emitChange({
      eventType: 'INSERT',
      commit_timestamp: '2026-11-13T10:01:00Z',
      new: { id: 'nr-a' },
    });
    assert.equal(userAUpdates, 0);

    mock.createdChannels[1].emitChange({
      eventType: 'INSERT',
      commit_timestamp: '2026-11-13T10:01:01Z',
      new: { id: 'nr-b' },
    });
    assert.equal(userBUpdates, 1);

    unsubB();
  });

  it('5. Surfaces CHANNEL_ERROR / TIMED_OUT / CLOSED errors and recovers via retryNotificationsSubscription()', async () => {
    const mock = createMockRealtimeSupabaseClient({ deferRemoveChannel: true });
    setSupabaseClientForTesting(mock.client);

    const statuses: RealtimeChannelStatus[] = [];
    const errors: ServiceError[] = [];

    const unsub = notificationService.subscribeToNotifications(
      'user-retry',
      () => {},
      (err) => errors.push(err),
      (status) => statuses.push(status)
    );

    mock.createdChannels[0].emitStatus('CHANNEL_ERROR', new Error('WebSocket failed'));
    assert.equal(statuses.includes('CHANNEL_ERROR'), true);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].isRetryable, true);

    mock.createdChannels[0].emitStatus('TIMED_OUT');
    assert.equal(statuses.includes('TIMED_OUT'), true);
    assert.equal(errors[1].category, 'NETWORK_ERROR');

    // Retry must replace broken channel and register listeners before subscribe()
    notificationService.retryNotificationsSubscription('user-retry');
    assert.equal(mock.createdChannels.length, 2);
    assert.equal(mock.createdChannels[1].calls[0].startsWith('on:postgres_changes:'), true);
    assert.equal(mock.createdChannels[1].calls[1], 'subscribe');

    mock.createdChannels[1].emitStatus('SUBSCRIBED');
    assert.equal(statuses[statuses.length - 1], 'SUBSCRIBED');

    unsub();
    await Promise.resolve();
  });

  it('6. Deduplicates rapid identical reconnect events while letting distinct changes pass', () => {
    const mock = createMockRealtimeSupabaseClient();
    setSupabaseClientForTesting(mock.client);

    let count = 0;
    const unsub = notificationService.subscribeToNotifications('user-dedup', () => {
      count += 1;
    });

    const dupPayload: RealtimeChangePayload = {
      eventType: 'INSERT',
      table: 'notification_recipients',
      commit_timestamp: '2026-11-13T10:05:00Z',
      new: { id: 'nr-dup', is_read: false },
    };

    mock.createdChannels[0].emitChange(dupPayload);
    mock.createdChannels[0].emitChange(dupPayload);
    assert.equal(count, 1);

    // Distinct commit timestamp or read-state mutation passes through
    mock.createdChannels[0].emitChange({
      ...dupPayload,
      eventType: 'UPDATE',
      commit_timestamp: '2026-11-13T10:05:01Z',
      new: { id: 'nr-dup', is_read: true },
    });
    assert.equal(count, 2);

    assert.equal(
      buildRealtimeEventDedupKey('notification_recipients', dupPayload),
      'notification_recipients:INSERT:nr-dup:2026-11-13T10:05:00Z:false'
    );

    unsub();
  });

  it('7. Reports CONFIGURATION_ERROR cleanly when Supabase client is not configured', () => {
    setSupabaseClientForTesting(null);

    let capturedError: unknown = null;
    const unsub = notificationService.subscribeToNotifications(
      'user-1',
      () => {},
      (err) => {
        capturedError = err;
      }
    );

    assert.ok(capturedError instanceof ServiceError);
    assert.equal(capturedError.category, 'CONFIGURATION_ERROR');
    assert.doesNotThrow(() => unsub());
  });
});
