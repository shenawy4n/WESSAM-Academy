/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const env: Record<string, string | undefined> =
  typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, string | undefined> }).env
    ? ((import.meta as { env?: Record<string, string | undefined> }).env as Record<string, string | undefined>)
    : {};

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabasePublishableKey =
  env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;

export function getMissingSupabaseEnv(): string[] {
  const missing: string[] = [];
  if (!supabaseUrl || supabaseUrl === 'https://your-project.supabase.co') {
    missing.push('VITE_SUPABASE_URL');
  }
  if (!supabasePublishableKey || supabasePublishableKey === 'your-anon-or-publishable-key') {
    missing.push('VITE_SUPABASE_PUBLISHABLE_KEY');
  }
  return missing;
}

export function isSupabaseConfigured(): boolean {
  return getMissingSupabaseEnv().length === 0;
}

export const supabase: SupabaseClient | null = isSupabaseConfigured()
  ? createClient(supabaseUrl!, supabasePublishableKey!, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;

let testClientOverride: SupabaseClient | null | undefined = undefined;

export function setSupabaseClientForTesting(client: SupabaseClient | null | undefined): void {
  testClientOverride = client;
}

export function getSupabaseClient(): SupabaseClient | null {
  return testClientOverride !== undefined ? testClientOverride : supabase;
}

