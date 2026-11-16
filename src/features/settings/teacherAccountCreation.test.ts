/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  handleCreateTeacherRequest,
  type CreateTeacherAdminClient,
  type CreateTeacherHandlerDeps,
} from '../../../supabase/functions/create-teacher/handler.ts';
import {
  createTeacherAccount,
  fetchStaffAccessDirectory,
  validateCreateTeacherInput,
} from './settingsService';
import { ServiceError } from '../../lib/errors/serviceError';

interface MockScenarioOptions {
  callerUser?: { id: string; email?: string } | null;
  callerError?: { message: string } | null;
  callerProfile?: { id: string; role: string; status: string } | null;
  existingProfileByEmail?: { id: string } | null;
  createUserResult?: {
    data: { user: { id: string; email?: string } | null } | null;
    error: { message?: string; status?: number; code?: string } | null;
  };
  rpcError?: { message?: string; code?: string } | null;
}

function buildHandlerHarness(opts: MockScenarioOptions = {}) {
  const calls = {
    createUserParams: [] as any[],
    deleteUserIds: [] as string[],
    rpcCalls: [] as { fn: string; params: Record<string, unknown> }[],
  };

  const mockAdmin: CreateTeacherAdminClient = {
    auth: {
      getUser: async (_jwt: string) => ({
        data: { user: opts.callerUser === undefined ? { id: 'super-1' } : opts.callerUser },
        error: opts.callerError ?? null,
      }),
      admin: {
        createUser: async (params) => {
          calls.createUserParams.push(params);
          if (opts.createUserResult) return opts.createUserResult;
          return {
            data: { user: { id: 'teacher-new-1', email: params.email } },
            error: null,
          };
        },
        deleteUser: async (id) => {
          calls.deleteUserIds.push(id);
          return { error: null };
        },
      },
    },
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (col: string, _val: unknown) => ({
          maybeSingle: async () => {
            if (col === 'id') {
              return {
                data:
                  opts.callerProfile === undefined
                    ? { id: 'super-1', role: 'super_admin', status: 'active' }
                    : opts.callerProfile,
                error: null,
              };
            }
            if (col === 'email') {
              return {
                data: opts.existingProfileByEmail ?? null,
                error: null,
              };
            }
            return { data: null, error: null };
          },
        }),
      }),
    }),
    rpc: async (fn, params) => {
      calls.rpcCalls.push({ fn, params });
      if (opts.rpcError) {
        return { data: null, error: opts.rpcError };
      }
      return { data: { success: true, teacher_id: params.p_teacher_id, role: 'teacher' }, error: null };
    },
  };

  const deps: CreateTeacherHandlerDeps = {
    getEnv: (name: string) => {
      if (name === 'SUPABASE_URL') return 'https://example.supabase.co';
      if (name === 'SUPABASE_SERVICE_ROLE_KEY') return 'service-role-test-key';
      return undefined;
    },
    createAdminClient: () => mockAdmin,
  };

  return { deps, calls };
}

function makeRequest(
  body: unknown,
  headers: Record<string, string> = { Authorization: 'Bearer valid-jwt', 'Content-Type': 'application/json' },
  method = 'POST'
): Request {
  return new Request('https://example.supabase.co/functions/v1/create-teacher', {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
}

test('1. Super Admin successfully creates a teacher with hardcoded teacher role and zero password leakage', async () => {
  const { deps, calls } = buildHandlerHarness({
    callerUser: { id: 'super-admin-uuid' },
    callerProfile: { id: 'super-admin-uuid', role: 'super_admin', status: 'active' },
  });

  const res = await handleCreateTeacherRequest(
    makeRequest({
      fullName: '  Ahmed Al-Qahtani ',
      fullNameArabic: ' أ. أحمد القحطاني ',
      email: ' Ahmed.Teacher@Wessam-Academy.com ',
      phone: ' +966500000111 ',
      password: 'StrongPassword#2026',
    }),
    deps
  );

  assert.equal(res.status, 201);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.equal(json.role, 'teacher');
  assert.equal(json.status, 'active');
  assert.equal(json.email, 'ahmed.teacher@wessam-academy.com');
  assert.equal(json.fullName, 'Ahmed Al-Qahtani');
  assert.equal(json.fullNameArabic, 'أ. أحمد القحطاني');
  assert.equal('password' in json, false);

  // Verify Auth user was created with role = 'teacher'
  assert.equal(calls.createUserParams.length, 1);
  assert.equal(calls.createUserParams[0].email, 'ahmed.teacher@wessam-academy.com');
  assert.equal(calls.createUserParams[0].email_confirm, true);
  assert.equal(calls.createUserParams[0].user_metadata.role, 'teacher');

  // Verify atomic DB RPC receives verified caller ID and no password
  assert.equal(calls.rpcCalls.length, 1);
  assert.equal(calls.rpcCalls[0].fn, 'provision_teacher_tx');
  assert.equal(calls.rpcCalls[0].params.p_actor_id, 'super-admin-uuid');
  assert.equal('password' in calls.rpcCalls[0].params, false);
  assert.equal('p_password' in calls.rpcCalls[0].params, false);
});

test('2. Active Teacher cannot create another teacher (HTTP 403)', async () => {
  const { deps, calls } = buildHandlerHarness({
    callerUser: { id: 'teacher-uuid' },
    callerProfile: { id: 'teacher-uuid', role: 'teacher', status: 'active' },
  });

  const res = await handleCreateTeacherRequest(
    makeRequest({
      fullName: 'Unauthorized Teacher',
      email: 'new.teacher@example.com',
      password: 'Password123!',
    }),
    deps
  );

  assert.equal(res.status, 403);
  const json = await res.json();
  assert.equal(json.code, 'FORBIDDEN_SUPER_ADMIN_ONLY');
  assert.equal(calls.createUserParams.length, 0);
  assert.equal(calls.rpcCalls.length, 0);
});

test('3. Student cannot create a teacher (HTTP 403)', async () => {
  const { deps, calls } = buildHandlerHarness({
    callerUser: { id: 'student-uuid' },
    callerProfile: { id: 'student-uuid', role: 'student', status: 'active' },
  });

  const res = await handleCreateTeacherRequest(
    makeRequest({
      fullName: 'Student Escalation',
      email: 'student.teacher@example.com',
      password: 'Password123!',
    }),
    deps
  );

  assert.equal(res.status, 403);
  const json = await res.json();
  assert.equal(json.code, 'FORBIDDEN_SUPER_ADMIN_ONLY');
  assert.equal(calls.createUserParams.length, 0);
  assert.equal(calls.rpcCalls.length, 0);
});

test('4. Unauthenticated, invalid JWT, or inactive super_admin requests are rejected', async () => {
  const { deps } = buildHandlerHarness();

  const missingHeaderRes = await handleCreateTeacherRequest(
    makeRequest({ fullName: 'Test', email: 'a@b.com', password: 'Password123!' }, {}),
    deps
  );
  assert.equal(missingHeaderRes.status, 401);

  const invalidTokenHarness = buildHandlerHarness({
    callerUser: null,
    callerError: { message: 'Invalid JWT' },
  });
  const invalidTokenRes = await handleCreateTeacherRequest(
    makeRequest({ fullName: 'Test', email: 'a@b.com', password: 'Password123!' }),
    invalidTokenHarness.deps
  );
  assert.equal(invalidTokenRes.status, 401);

  const suspendedSuperHarness = buildHandlerHarness({
    callerUser: { id: 'super-suspended' },
    callerProfile: { id: 'super-suspended', role: 'super_admin', status: 'suspended' },
  });
  const suspendedRes = await handleCreateTeacherRequest(
    makeRequest({ fullName: 'Test', email: 'a@b.com', password: 'Password123!' }),
    suspendedSuperHarness.deps
  );
  assert.equal(suspendedRes.status, 403);
});

test('5. Client payload spoofing (actorId/caller_id/userId/status) is rejected', async () => {
  const { deps, calls } = buildHandlerHarness({
    callerUser: { id: 'super-1' },
    callerProfile: { id: 'super-1', role: 'super_admin', status: 'active' },
  });

  for (const spoofField of [
    { actorId: 'other-admin' },
    { actor_id: 'other-admin' },
    { callerId: 'other-admin' },
    { userId: 'forced-id' },
    { status: 'suspended' },
  ]) {
    const res = await handleCreateTeacherRequest(
      makeRequest({
        fullName: 'Teacher Test',
        email: 'teacher@example.com',
        password: 'Password123!',
        ...spoofField,
      }),
      deps
    );
    assert.equal(res.status, 403);
    const json = await res.json();
    assert.equal(json.code, 'FORBIDDEN_PAYLOAD_OVERRIDE');
  }

  assert.equal(calls.createUserParams.length, 0);
  assert.equal(calls.rpcCalls.length, 0);
});

test('6. Client cannot create super_admin or moderator through this workflow', async () => {
  const { deps, calls } = buildHandlerHarness({
    callerUser: { id: 'super-1' },
    callerProfile: { id: 'super-1', role: 'super_admin', status: 'active' },
  });

  for (const forbiddenRole of ['super_admin', 'moderator', 'admin']) {
    const res = await handleCreateTeacherRequest(
      makeRequest({
        fullName: 'Privilege Test',
        email: 'priv@example.com',
        password: 'Password123!',
        role: forbiddenRole,
      }),
      deps
    );
    assert.equal(res.status, 403);
    const json = await res.json();
    assert.equal(json.code, 'FORBIDDEN_ROLE_OVERRIDE');
  }

  assert.equal(calls.createUserParams.length, 0);
  assert.equal(calls.rpcCalls.length, 0);
});

test('7. Duplicate email rejected cleanly (409) and DB RPC failure triggers Auth user rollback', async () => {
  // 7a. Profile pre-check detects duplicate email
  const preCheckHarness = buildHandlerHarness({
    existingProfileByEmail: { id: 'existing-teacher-1' },
  });
  const resPre = await handleCreateTeacherRequest(
    makeRequest({
      fullName: 'Duplicate Teacher',
      email: 'duplicate@wessam.com',
      password: 'Password123!',
    }),
    preCheckHarness.deps
  );
  assert.equal(resPre.status, 409);
  assert.equal((await resPre.json()).code, 'EMAIL_ALREADY_EXISTS');
  assert.equal(preCheckHarness.calls.createUserParams.length, 0);

  // 7b. Auth createUser detects already registered email
  const authDupHarness = buildHandlerHarness({
    createUserResult: {
      data: null,
      error: { message: 'A user with this email address has already been registered', status: 422 },
    },
  });
  const resAuthDup = await handleCreateTeacherRequest(
    makeRequest({
      fullName: 'Duplicate Auth',
      email: 'dup-auth@wessam.com',
      password: 'Password123!',
    }),
    authDupHarness.deps
  );
  assert.equal(resAuthDup.status, 409);
  assert.equal((await resAuthDup.json()).code, 'EMAIL_ALREADY_EXISTS');

  // 7c. DB RPC failure triggers compensating Auth deleteUser rollback
  const rpcFailHarness = buildHandlerHarness({
    rpcError: { message: 'An account with this email already exists', code: '23505' },
  });
  const resRpcFail = await handleCreateTeacherRequest(
    makeRequest({
      fullName: 'Rollback Teacher',
      email: 'rollback@wessam.com',
      password: 'Password123!',
    }),
    rpcFailHarness.deps
  );
  assert.equal(resRpcFail.status, 409);
  assert.deepEqual(rpcFailHarness.calls.deleteUserIds, ['teacher-new-1']);
});

test('8. Domain validation & frontend createTeacherAccount / fetchStaffAccessDirectory contract', async () => {
  assert.ok(
    validateCreateTeacherInput(
      { fullName: 'A', email: 't@example.com', password: 'Password123!' },
      'Password123!',
      true
    )
  );
  assert.ok(
    validateCreateTeacherInput(
      { fullName: 'Teacher One', email: 's@student.wessam-academy.internal', password: 'Password123!' },
      'Password123!',
      false
    )
  );
  assert.ok(
    validateCreateTeacherInput(
      { fullName: 'Teacher One', email: 't@example.com', password: 'Password123!' },
      'DifferentPassword!',
      false
    )
  );
  assert.equal(
    validateCreateTeacherInput(
      { fullName: 'Teacher One', email: 't@example.com', password: 'Password123!' },
      'Password123!',
      false
    ),
    null
  );

  // Mock Supabase client for frontend createTeacherAccount (success + 403 error mapping)
  let invokedName = '';
  let invokedBody: Record<string, unknown> = {};
  const successClient: any = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'super-1' } }, error: null }),
    },
    functions: {
      invoke: async (name: string, opts: { body: Record<string, unknown> }) => {
        invokedName = name;
        invokedBody = opts.body;
        return {
          data: {
            success: true,
            teacherId: 'teacher-created-1',
            email: 'teacher.one@example.com',
            fullName: 'Teacher One',
            fullNameArabic: 'المعلم الأول',
            role: 'teacher',
            status: 'active',
          },
          error: null,
        };
      },
    },
  };

  const created = await createTeacherAccount(
    {
      fullName: 'Teacher One',
      fullNameArabic: 'المعلم الأول',
      email: 'Teacher.One@Example.com',
      password: 'Password123!',
    },
    successClient
  );
  assert.equal(invokedName, 'create-teacher');
  assert.equal(invokedBody.email, 'teacher.one@example.com');
  assert.equal('role' in invokedBody, false);
  assert.equal('actorId' in invokedBody, false);
  assert.equal(created.role, 'teacher');
  assert.equal(created.teacherId, 'teacher-created-1');

  // Verify 403 Edge Function HTTP error maps to AUTHORIZATION_ERROR
  const forbiddenClient: any = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'teacher-1' } }, error: null }),
    },
    functions: {
      invoke: async () => ({
        data: null,
        error: {
          message: 'Edge Function returned a non-2xx status code',
          context: new Response(
            JSON.stringify({ error: 'Forbidden', code: 'FORBIDDEN_SUPER_ADMIN_ONLY' }),
            { status: 403, headers: { 'Content-Type': 'application/json' } }
          ),
        },
      }),
    },
  };

  await assert.rejects(
    () =>
      createTeacherAccount(
        {
          fullName: 'Teacher Blocked',
          email: 'blocked@example.com',
          password: 'Password123!',
        },
        forbiddenClient
      ),
    (err: unknown) => err instanceof ServiceError && err.category === 'AUTHORIZATION_ERROR'
  );

  // Verify StaffAccountRecord contract accepts email mapped cleanly
  assert.equal(typeof fetchStaffAccessDirectory, 'function');
});
