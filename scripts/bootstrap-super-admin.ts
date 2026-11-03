/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * WESSAM Academy — Super Admin One-Time Bootstrap Script
 * Execution Rule: Runs solely in administrative CLI environments with service-role permissions.
 * Never hardcodes passwords or commits secrets.
 * 
 * Usage:
 *   BOOTSTRAP_SUPERADMIN_PASSWORD="<password>" \
 *   SUPABASE_URL="https://your-project.supabase.co" \
 *   SUPABASE_SERVICE_ROLE_KEY="<key>" \
 *   npx tsx scripts/bootstrap-super-admin.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPER_ADMIN_EMAIL = 'shenawyjr@gmail.com';
const FULL_NAME = 'Mr. Wessam Ibrahim Draz';
const FULL_NAME_ARABIC = 'أ. وسام إبراهيم دراز';

async function bootstrapSuperAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  const password = process.env.BOOTSTRAP_SUPERADMIN_PASSWORD;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required.');
    process.exit(1);
  }

  if (!password || password.length < 8) {
    console.error('Error: BOOTSTRAP_SUPERADMIN_PASSWORD environment variable is required (min 8 chars).');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`Starting bootstrap verification for: ${SUPER_ADMIN_EMAIL}`);

  // 1. Check if Auth user already exists
  const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) {
    console.error('Failed to query Supabase Auth users:', listErr.message);
    process.exit(1);
  }

  const existingAuthUser = users.find((u) => u.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase());
  let userId = existingAuthUser?.id;

  if (!existingAuthUser) {
    console.log('Creating new Supabase Auth Super Admin identity...');
    const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
      email: SUPER_ADMIN_EMAIL,
      password: password,
      email_confirm: true,
      user_metadata: {
        role: 'super_admin',
        full_name: FULL_NAME,
      },
    });

    if (createErr || !newUser.user) {
      console.error('Failed to create Auth user:', createErr?.message);
      process.exit(1);
    }
    userId = newUser.user.id;
    console.log('Auth user created successfully.');
  } else {
    if (!userId) {
      console.error('Failed to locate Auth User ID.');
      process.exit(1);
    }
    console.log(`Auth user exists with UUID: ${userId}. Updating password and metadata...`);
    const { error: updateErr } = await supabase.auth.admin.updateUserById(userId, {
      password: password,
      email_confirm: true,
      user_metadata: { role: 'super_admin', full_name: FULL_NAME },
    });
    if (updateErr) {
      console.error('Failed to update existing user password:', updateErr.message);
      process.exit(1);
    }
  }

  // 2. Upsert profile in public.profiles table
  console.log('Syncing database profile in public.profiles...');
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .upsert({
      id: userId,
      role: 'super_admin',
      full_name: FULL_NAME,
      full_name_arabic: FULL_NAME_ARABIC,
      email: SUPER_ADMIN_EMAIL,
      status: 'active',
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (profileErr) {
    console.error('Failed to upsert profile record:', profileErr.message);
    process.exit(1);
  }

  // 3. Verification check
  if (profile.role !== 'super_admin' || profile.status !== 'active') {
    console.error('Verification failed: Profile role or status does not match super_admin active specification.');
    process.exit(1);
  }

  console.log('---------------------------------------------------------');
  console.log('Super Admin account successfully bootstrapped and verified!');
  console.log(`Email:   ${SUPER_ADMIN_EMAIL}`);
  console.log(`Role:    ${profile.role}`);
  console.log(`Status:  ${profile.status}`);
  console.log(`Auth ID: ${userId}`);
  console.log('---------------------------------------------------------');
  console.log('IMPORTANT: The owner should sign in immediately and update their password in Profile Settings.');
}

// Only execute when invoked directly via CLI
if (process.argv[1]?.endsWith('bootstrap-super-admin.ts')) {
  bootstrapSuperAdmin().catch((err) => {
    console.error('Unexpected bootstrap error:', err);
    process.exit(1);
  });
}
