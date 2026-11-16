/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * WESSAM Academy — Edge Function Core Handler: create-teacher
 * Strictly allows ONLY verified active 'super_admin' callers to provision new 'teacher' accounts.
 * Framework-agnostic handler so both Deno Edge Function runtime and Node security test suite
 * execute the exact same authorization, validation, provisioning, and rollback logic.
 */

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export interface CreateTeacherAdminClient {
  auth: {
    getUser: (jwt: string) => Promise<{
      data: { user: { id: string; email?: string | null } | null };
      error: { message: string } | null;
    }>;
    admin: {
      createUser: (params: {
        email: string;
        password: string;
        email_confirm: boolean;
        user_metadata: Record<string, unknown>;
      }) => Promise<{
        data: { user: { id: string; email?: string | null } | null } | null;
        error: { message?: string; status?: number; code?: string } | null;
      }>;
      deleteUser: (id: string) => Promise<{ error: { message: string } | null }>;
    };
  };
  from: (table: string) => {
    select: (columns: string) => {
      eq: (col: string, val: unknown) => {
        maybeSingle: () => Promise<{ data: any; error: { message?: string } | null }>;
      };
    };
  };
  rpc: (
    fn: string,
    params: Record<string, unknown>
  ) => Promise<{ data: any; error: { message?: string; code?: string } | null }>;
}

export interface CreateTeacherHandlerDeps {
  getEnv: (name: string) => string | undefined;
  createAdminClient: (supabaseUrl: string, serviceRoleKey: string) => CreateTeacherAdminClient;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SPOOFING_KEYS = new Set([
  'actorId',
  'actor_id',
  'callerId',
  'caller_id',
  'userId',
  'user_id',
  'id',
  'status',
]);

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isDuplicateEmailError(err: { message?: string; status?: number; code?: string } | null): boolean {
  if (!err) return false;
  if (err.code === '23505' || err.code === 'email_exists') return true;
  const msg = (err.message || '').toLowerCase();
  return (
    msg.includes('already been registered') ||
    msg.includes('already registered') ||
    msg.includes('already exists') ||
    msg.includes('duplicate key')
  );
}

export async function handleCreateTeacherRequest(
  req: Request,
  deps: CreateTeacherHandlerDeps
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' }, 405);
  }

  let createdAuthUserId: string | null = null;
  let supabaseAdmin: CreateTeacherAdminClient | null = null;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return jsonResponse(
        { error: 'Missing or malformed authorization token.', code: 'UNAUTHENTICATED' },
        401
      );
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      return jsonResponse(
        { error: 'Missing or malformed authorization token.', code: 'UNAUTHENTICATED' },
        401
      );
    }

    const supabaseUrl = (deps.getEnv('SUPABASE_URL') ?? '').trim();
    const supabaseServiceKey = (
      deps.getEnv('SUPABASE_SERVICE_ROLE_KEY') ??
      deps.getEnv('SUPABASE_SECRET_KEY') ??
      ''
    ).trim();

    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse(
        { error: 'Server configuration error.', code: 'SERVER_CONFIG_ERROR' },
        500
      );
    }

    supabaseAdmin = deps.createAdminClient(supabaseUrl, supabaseServiceKey);

    // 1. Verify caller JWT via Supabase Auth
    const {
      data: { user: caller },
      error: callerError,
    } = await supabaseAdmin.auth.getUser(token);

    if (callerError || !caller?.id) {
      return jsonResponse(
        { error: 'Invalid or expired credentials.', code: 'INVALID_TOKEN' },
        401
      );
    }

    // 2. Enforce strictly active super_admin role from authoritative database profile
    const { data: callerProfile, error: profileCheckError } = await supabaseAdmin
      .from('profiles')
      .select('id, role, status')
      .eq('id', caller.id)
      .maybeSingle();

    if (
      profileCheckError ||
      !callerProfile ||
      callerProfile.role !== 'super_admin' ||
      callerProfile.status !== 'active'
    ) {
      return jsonResponse(
        {
          error: 'Forbidden: Only verified active super admins can create teacher accounts.',
          code: 'FORBIDDEN_SUPER_ADMIN_ONLY',
        },
        403
      );
    }

    // 3. Parse and sanitize payload
    const rawPayload = await req.json().catch(() => null);
    if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
      return jsonResponse({ error: 'Invalid JSON request body.', code: 'INVALID_BODY' }, 400);
    }

    const payload = rawPayload as Record<string, unknown>;

    // Block privilege escalation / payload identity spoofing attempts
    for (const key of SPOOFING_KEYS) {
      if (key in payload && payload[key] !== undefined) {
        return jsonResponse(
          {
            error: 'Forbidden: Caller identity, target user ID, and status cannot be specified in request payload.',
            code: 'FORBIDDEN_PAYLOAD_OVERRIDE',
          },
          403
        );
      }
    }

    if ('role' in payload && payload.role !== undefined && payload.role !== 'teacher') {
      return jsonResponse(
        {
          error: 'Forbidden: Only teacher accounts may be provisioned through this endpoint.',
          code: 'FORBIDDEN_ROLE_OVERRIDE',
        },
        403
      );
    }

    const { fullName, fullNameArabic, email, phone, password } = payload;

    // 4. Validate domain fields
    if (typeof fullName !== 'string' || fullName.trim().length < 2 || fullName.trim().length > 150) {
      return jsonResponse(
        { error: 'Teacher full name must be between 2 and 150 characters.', code: 'INVALID_FULL_NAME' },
        400
      );
    }
    const trimmedFullName = fullName.trim();

    let resolvedArabicName = trimmedFullName;
    if (fullNameArabic !== undefined && fullNameArabic !== null) {
      if (typeof fullNameArabic !== 'string') {
        return jsonResponse(
          { error: 'Arabic full name must be a string.', code: 'INVALID_ARABIC_NAME' },
          400
        );
      }
      const trimmedArabic = fullNameArabic.trim();
      if (trimmedArabic.length > 0) {
        if (trimmedArabic.length < 2 || trimmedArabic.length > 150) {
          return jsonResponse(
            {
              error: 'Arabic full name must be between 2 and 150 characters when provided.',
              code: 'INVALID_ARABIC_NAME',
            },
            400
          );
        }
        resolvedArabicName = trimmedArabic;
      }
    }

    if (typeof email !== 'string') {
      return jsonResponse({ error: 'A valid email address is required.', code: 'INVALID_EMAIL' }, 400);
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || normalizedEmail.length > 254 || !EMAIL_REGEX.test(normalizedEmail)) {
      return jsonResponse({ error: 'Please provide a valid email address.', code: 'INVALID_EMAIL' }, 400);
    }
    if (normalizedEmail.endsWith('@student.wessam-academy.internal')) {
      return jsonResponse(
        {
          error: 'Student internal domain emails cannot be used for teacher accounts.',
          code: 'INVALID_EMAIL_DOMAIN',
        },
        400
      );
    }

    let trimmedPhone: string | null = null;
    if (phone !== undefined && phone !== null && phone !== '') {
      if (typeof phone !== 'string' || phone.trim().length > 30) {
        return jsonResponse(
          { error: 'Phone number must be at most 30 characters.', code: 'INVALID_PHONE' },
          400
        );
      }
      trimmedPhone = phone.trim() || null;
    }

    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
      return jsonResponse(
        { error: 'Initial password must be between 8 and 128 characters.', code: 'INVALID_PASSWORD' },
        400
      );
    }
    if (password.trim().length < 8) {
      return jsonResponse(
        { error: 'Password must contain at least 8 non-whitespace characters.', code: 'INVALID_PASSWORD' },
        400
      );
    }

    // 5. Duplicate email pre-check in public.profiles
    const { data: existingProfile, error: existingErr } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (existingErr) {
      return jsonResponse(
        { error: 'Unable to verify email availability.', code: 'DATABASE_ERROR' },
        500
      );
    }

    if (existingProfile) {
      return jsonResponse(
        { error: 'An account with this email already exists.', code: 'EMAIL_ALREADY_EXISTS' },
        409
      );
    }

    // 6. Create Supabase Auth user with hardcoded server-side role = 'teacher'
    const { data: createdUserData, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        role: 'teacher',
        full_name: trimmedFullName,
        full_name_arabic: resolvedArabicName,
      },
    });

    if (createAuthError || !createdUserData?.user?.id) {
      if (isDuplicateEmailError(createAuthError)) {
        return jsonResponse(
          { error: 'An account with this email already exists.', code: 'EMAIL_ALREADY_EXISTS' },
          409
        );
      }
      return jsonResponse(
        {
          error: createAuthError?.message || 'Failed to initialize teacher identity in Auth.',
          code: 'AUTH_CREATE_FAILED',
        },
        400
      );
    }

    createdAuthUserId = createdUserData.user.id;
    const teacherUid = createdUserData.user.id;

    // 7. Execute atomic transactional DB provisioning (profile + audit log)
    const { error: rpcError } = await supabaseAdmin.rpc('provision_teacher_tx', {
      p_teacher_id: teacherUid,
      p_full_name: trimmedFullName,
      p_full_name_arabic: resolvedArabicName,
      p_email: normalizedEmail,
      p_phone: trimmedPhone,
      p_actor_id: caller.id,
    });

    if (rpcError) {
      // Atomic compensation rollback of orphaned Auth user
      if (createdAuthUserId && supabaseAdmin) {
        try {
          await supabaseAdmin.auth.admin.deleteUser(createdAuthUserId);
        } catch (rollbackErr) {
          console.error('Failed to rollback orphaned teacher auth user:', rollbackErr);
        }
      }

      if (isDuplicateEmailError(rpcError)) {
        return jsonResponse(
          { error: 'An account with this email already exists.', code: 'EMAIL_ALREADY_EXISTS' },
          409
        );
      }

      if (rpcError.code === '42501') {
        return jsonResponse(
          {
            error: 'Forbidden: Only verified active super admins can create teacher accounts.',
            code: 'FORBIDDEN_SUPER_ADMIN_ONLY',
          },
          403
        );
      }

      return jsonResponse(
        {
          error: 'Failed to complete teacher provisioning. Transaction was rolled back.',
          code: 'PROVISIONING_FAILED',
        },
        500
      );
    }

    // Never return passwords, session tokens, or internal keys
    return jsonResponse(
      {
        success: true,
        teacherId: teacherUid,
        email: normalizedEmail,
        fullName: trimmedFullName,
        fullNameArabic: resolvedArabicName,
        role: 'teacher',
        status: 'active',
        message: 'Teacher account successfully provisioned.',
      },
      201
    );
  } catch (_err) {
    if (createdAuthUserId && supabaseAdmin) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(createdAuthUserId);
      } catch (rollbackErr) {
        console.error('Failed to rollback orphaned teacher auth user after error:', rollbackErr);
      }
    }

    return jsonResponse(
      {
        error: 'Failed to complete teacher provisioning. Transaction was rolled back.',
        code: 'PROVISIONING_FAILED',
      },
      500
    );
  }
}
