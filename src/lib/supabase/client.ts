/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

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
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;
