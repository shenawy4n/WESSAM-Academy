/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * WESSAM Academy — Hardened Super Admin One-Time Bootstrap Script
 * Execution Rule: Runs solely in administrative CLI environments with service-role permissions.
 * Never hardcodes passwords or commits secrets.
 * 
 * Security Guardrails:
 * 1. Explicit EXPECTED_PROJECT_REF validation against SUPABASE_URL hostname.
 * 2. Interactive confirmation gate (TTY) or explicit BOOTSTRAP_CONFIRM_PROJECT variable (non-TTY).
 * 3. Hidden terminal prompt for password input (no echo, avoids shell history pollution).
 * 4. Paginated lookup in Supabase Auth to prevent false-negative user omission.
 * 5. Idempotent & Fail-Safe:
 *    - If already super_admin + active: Exits cleanly without modifying credentials or data.
 *    - If exists with another role or invalid state: Aborts immediately to prevent takeover.
 * 6. Uses strict .insert() rather than unrestricted .upsert() on public.profiles.
 * 7. Verified compensation rollback on failure with manual recovery telemetry if deletion fails.
 * 8. Never logs passwords, API keys, or JWT tokens.
 */

import * as readline from 'node:readline';
import { Writable } from 'node:stream';
import { createClient, type User } from '@supabase/supabase-js';

const SUPER_ADMIN_EMAIL = 'shenawyjr@gmail.com';
const FULL_NAME = 'Mr. Wessam Ibrahim Draz';
const FULL_NAME_ARABIC = 'أ. وسام إبراهيم دراز';

function promptVisible(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function promptHidden(query: string): Promise<string> {
  return new Promise((resolve) => {
    let muted = false;
    const mutableStdout = new Writable({
      write(chunk, encoding, callback) {
        if (!muted) {
          process.stdout.write(chunk, encoding);
        }
        callback();
      },
    });

    const rl = readline.createInterface({
      input: process.stdin,
      output: mutableStdout,
      terminal: true,
    });

    process.stdout.write(query);
    muted = true;

    rl.question('', (answer) => {
      muted = false;
      process.stdout.write('\n');
      rl.close();
      resolve(answer.trim());
    });
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findAuthUserByEmail(supabase: any, email: string): Promise<User | null> {
  const normalizedEmail = email.trim().toLowerCase();
  let page = 1;
  const perPage = 50;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error(`Failed to query Auth users: ${error.message}`);
    }

    const match = (data.users as User[]).find((u: User) => u.email?.toLowerCase() === normalizedEmail);
    if (match) {
      return match;
    }

    if (data.users.length < perPage) {
      break;
    }

    page += 1;
  }

  return null;
}

async function bootstrapSuperAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  const expectedProjectRef = process.env.EXPECTED_PROJECT_REF?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('CRITICAL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required.');
    process.exit(1);
  }

  if (!expectedProjectRef) {
    console.error('CRITICAL: EXPECTED_PROJECT_REF environment variable is required to prevent accidental execution against an arbitrary Supabase project.');
    console.error('Example: EXPECTED_PROJECT_REF="abcdefghijklmnop"');
    process.exit(1);
  }

  // Parse and verify project reference from SUPABASE_URL
  let actualProjectRef = 'unknown';
  try {
    const parsed = new URL(supabaseUrl);
    actualProjectRef = parsed.hostname.split('.')[0] || parsed.hostname;
  } catch {
    console.error('CRITICAL: Invalid SUPABASE_URL format.');
    process.exit(1);
  }

  if (actualProjectRef !== expectedProjectRef) {
    console.error('===============================================================');
    console.error('CRITICAL SECURITY ABORT: Project reference mismatch!');
    console.error(`Configured EXPECTED_PROJECT_REF: "${expectedProjectRef}"`);
    console.error(`Actual SUPABASE_URL project ref: "${actualProjectRef}"`);
    console.error('Execution halted to protect against accidental modification of the wrong environment.');
    console.error('===============================================================');
    process.exit(1);
  }

  console.log('===============================================================');
  console.log('  WESSAM ACADEMY — SUPER ADMIN BOOTSTRAP GATEWAY               ');
  console.log('===============================================================');
  console.log(`Target Project Host: ${supabaseUrl}`);
  console.log(`Verified Project:    ${actualProjectRef}`);
  console.log(`Target Admin Email:  ${SUPER_ADMIN_EMAIL}`);
  console.log('---------------------------------------------------------------');

  // Confirmation Gate
  if (process.stdin.isTTY) {
    const confirmation = await promptVisible(`Type '${actualProjectRef}' to confirm execution on this project: `);
    if (confirmation !== actualProjectRef) {
      console.log('Bootstrap cancelled: Project confirmation did not match.');
      process.exit(0);
    }
  } else {
    const nonTtyConfirm = process.env.BOOTSTRAP_CONFIRM_PROJECT?.trim();
    if (nonTtyConfirm !== actualProjectRef) {
      console.error('CRITICAL: In non-interactive mode, BOOTSTRAP_CONFIRM_PROJECT matching the project ref is required for safety.');
      process.exit(1);
    }
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('Inspecting Supabase Auth & Database state...');

  // 1. Check existing Auth identity with full pagination
  const existingAuthUser = await findAuthUserByEmail(supabase, SUPER_ADMIN_EMAIL);

  // 2. Check existing Profile record
  let existingProfile: { id: string; role: string; status: string } | null = null;
  if (existingAuthUser) {
    const { data: profileData, error: profileErr } = await supabase
      .from('profiles')
      .select('id, role, status')
      .eq('id', existingAuthUser.id)
      .maybeSingle();

    if (profileErr) {
      console.error(`Database error checking existing profile: ${profileErr.message}`);
      process.exit(1);
    }
    existingProfile = profileData;
  }

  // 3. Evaluate Idempotency & Collision
  if (existingAuthUser && existingProfile) {
    if (existingProfile.role === 'super_admin' && existingProfile.status === 'active') {
      console.log('===============================================================');
      console.log('IDEMPOTENT SUCCESS:');
      console.log(`Super Admin (${SUPER_ADMIN_EMAIL}) is already provisioned with active status.`);
      console.log('No passwords or credentials were modified.');
      console.log(`Auth UID: ${existingAuthUser.id}`);
      console.log('===============================================================');
      process.exit(0);
    }

    // Role mismatch or inactive status
    console.error('===============================================================');
    console.error('SECURITY ABORT: Collision detected.');
    console.error(`User ${SUPER_ADMIN_EMAIL} already exists with role="${existingProfile.role}" and status="${existingProfile.status}".`);
    console.error('Automatic password resets or role promotions are strictly prohibited.');
    console.error('Manual DBA / Security Officer review is required.');
    console.error('===============================================================');
    process.exit(1);
  }

  if (existingAuthUser && !existingProfile) {
    console.error('===============================================================');
    console.error('SECURITY ABORT: Orphaned Auth account detected.');
    console.error(`Auth user exists for ${SUPER_ADMIN_EMAIL} without a public.profiles record.`);
    console.error('Resolve this inconsistency manually before running bootstrap.');
    console.error('===============================================================');
    process.exit(1);
  }

  // 4. Secure Password Collection
  let password = process.env.BOOTSTRAP_SUPERADMIN_PASSWORD;

  if (!password && process.stdin.isTTY) {
    password = await promptHidden('Enter new Super Admin password (min 12 characters, hidden): ');
    const confirmPassword = await promptHidden('Confirm new Super Admin password: ');

    if (password !== confirmPassword) {
      console.error('Error: Passwords do not match.');
      process.exit(1);
    }
  }

  if (!password || password.length < 12) {
    console.error('Error: Super Admin password must be at least 12 characters long.');
    process.exit(1);
  }

  // 5. Account Provisioning (Atomic creation)
  console.log(`Creating fresh Super Admin Auth user for ${SUPER_ADMIN_EMAIL}...`);
  const { data: authResult, error: createAuthErr } = await supabase.auth.admin.createUser({
    email: SUPER_ADMIN_EMAIL,
    password: password,
    email_confirm: true,
    user_metadata: {
      role: 'super_admin',
      full_name: FULL_NAME,
      full_name_arabic: FULL_NAME_ARABIC,
    },
  });

  if (createAuthErr || !authResult.user) {
    console.error(`Auth creation failed: ${createAuthErr?.message}`);
    process.exit(1);
  }

  const newUserId = authResult.user.id;

  // 6. Strict Profile Insertion (NOT unrestricted upsert)
  console.log('Creating matching record in public.profiles...');
  const { error: insertProfileErr } = await supabase
    .from('profiles')
    .insert({
      id: newUserId,
      role: 'super_admin',
      full_name: FULL_NAME,
      full_name_arabic: FULL_NAME_ARABIC,
      phone: null,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

  if (insertProfileErr) {
    console.error(`Profile creation failed: ${insertProfileErr.message}`);
    console.error(`Initiating compensation rollback for Auth account ${newUserId}...`);
    
    const { error: rollbackErr } = await supabase.auth.admin.deleteUser(newUserId);
    if (rollbackErr) {
      console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
      console.error('CRITICAL ROLLBACK FAILURE: Auth identity could not be deleted!');
      console.error(`Orphaned Auth UID: ${newUserId}`);
      console.error(`Error message:     ${rollbackErr.message}`);
      console.error('MANUAL ACTION REQUIRED: Log in to Supabase Console > Authentication and delete this account manually.');
      console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    } else {
      console.log(`Compensation rollback confirmed: Auth identity ${newUserId} successfully purged.`);
    }
    process.exit(1);
  }

  console.log('===============================================================');
  console.log('SUCCESS: Super Admin account provisioned securely.');
  console.log(`Target Email: ${SUPER_ADMIN_EMAIL}`);
  console.log(`Auth UID:     ${newUserId}`);
  console.log(`Role:         super_admin`);
  console.log(`Status:       active`);
  console.log('===============================================================');
}

if (process.argv[1]?.endsWith('bootstrap-super-admin.ts')) {
  bootstrapSuperAdmin().catch((err) => {
    console.error('Unexpected error during Super Admin bootstrap:', err);
    process.exit(1);
  });
}
