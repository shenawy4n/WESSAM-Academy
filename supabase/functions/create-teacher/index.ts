/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * WESSAM Academy — Edge Function: create-teacher
 * Authenticated administrative function exclusively for active Super Admins to create Teacher accounts.
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCreateTeacherRequest } from './handler.ts';

serve((req: Request) =>
  handleCreateTeacherRequest(req, {
    getEnv: (name: string) => Deno.env.get(name),
    createAdminClient: (supabaseUrl: string, serviceRoleKey: string) =>
      createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      }) as any,
  })
);
