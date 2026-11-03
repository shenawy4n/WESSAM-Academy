/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * WESSAM Academy — Edge Function: create-student
 * Authenticated administrative function for Teachers and Super Admins to provision students.
 * Utilizes the transactional database RPC (provision_student_tx) for atomic multi-table consistency,
 * with automated rollback deleting the Auth user upon any database transaction failure.
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let createdAuthUserId: string | null = null;
  let supabaseAdmin: any = null;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing or malformed authorization token.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey =
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? '';

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Server configuration error.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Verify caller identity using JWT token
    const token = authHeader.replace('Bearer ', '').trim();
    const { data: { user: caller }, error: callerError } = await supabaseAdmin.auth.getUser(token);

    if (callerError || !caller) {
      return new Response(JSON.stringify({ error: 'Invalid or expired credentials.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Verify caller has active 'teacher' or 'super_admin' role in profiles
    const { data: callerProfile, error: profileCheckError } = await supabaseAdmin
      .from('profiles')
      .select('role, status')
      .eq('id', caller.id)
      .maybeSingle();

    if (
      profileCheckError ||
      !callerProfile ||
      (callerProfile.role !== 'teacher' && callerProfile.role !== 'super_admin') ||
      callerProfile.status !== 'active'
    ) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Only verified active teachers and administrators can provision students.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload = await req.json().catch(() => null);
    if (!payload || typeof payload !== 'object') {
      return new Response(JSON.stringify({ error: 'Invalid request body.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const {
      fullName,
      fullNameArabic,
      username,
      password,
      studentNumber,
      phone,
      groupId,
      notes,
    } = payload;

    // 3. Strict Input Validation
    if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
      return new Response(JSON.stringify({ error: 'Valid student full name is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!username || typeof username !== 'string') {
      return new Response(JSON.stringify({ error: 'Username is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const normalizedUsername = username.trim().toLowerCase();
    const usernameRegex = /^[a-zA-Z0-9._-]{3,30}$/;
    if (!usernameRegex.test(normalizedUsername)) {
      return new Response(
        JSON.stringify({
          error: 'Username must be 3-30 characters and contain only letters, numbers, dots, dashes, or underscores.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return new Response(
        JSON.stringify({ error: 'Password must be at least 8 characters long.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Pre-check username availability in student_credentials
    const { data: existingUser } = await supabaseAdmin
      .from('student_credentials')
      .select('id')
      .eq('username', normalizedUsername)
      .maybeSingle();

    if (existingUser) {
      return new Response(
        JSON.stringify({ error: 'The requested username is already registered. Please choose another.' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Unique internal pseudo-email
    const internalEmail = `${normalizedUsername}@student.wessam-academy.internal`;

    // 5. Create auth user with Supabase Auth admin API (strictly role: student)
    const { data: newUser, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
      email: internalEmail,
      password: password,
      email_confirm: true,
      user_metadata: {
        role: 'student',
        username: normalizedUsername,
      },
    });

    if (createAuthError || !newUser?.user) {
      return new Response(
        JSON.stringify({ error: createAuthError?.message || 'Failed to initialize student identity in Auth.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    createdAuthUserId = newUser.user.id;
    const studentUid = newUser.user.id;

    // 6. Execute atomic database provisioning via PostgreSQL RPC (provision_student_tx)
    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('provision_student_tx', {
      p_student_id: studentUid,
      p_full_name: fullName.trim(),
      p_full_name_arabic: fullNameArabic ? fullNameArabic.trim() : fullName.trim(),
      p_phone: phone ? String(phone).trim() : null,
      p_username: normalizedUsername,
      p_internal_email: internalEmail,
      p_student_number: studentNumber ? String(studentNumber).trim() : null,
      p_group_id: groupId || null,
      p_notes: notes ? String(notes).trim() : null,
      p_actor_id: caller.id,
    });

    if (rpcError) {
      throw new Error(`Transactional provisioning failed: ${rpcError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        studentId: studentUid,
        username: normalizedUsername,
        message: 'Student account successfully provisioned atomically.',
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    // ATOMIC ROLLBACK: If Auth user was created but DB transaction failed, delete Auth user
    if (createdAuthUserId && supabaseAdmin) {
      console.warn(`Rolling back orphaned auth user ${createdAuthUserId} due to failure:`, error?.message);
      try {
        await supabaseAdmin.auth.admin.deleteUser(createdAuthUserId);
      } catch (rollbackErr) {
        console.error('Failed to rollback orphaned auth user:', rollbackErr);
      }
    }

    console.error('Student provisioning error:', error?.message);
    return new Response(
      JSON.stringify({ error: error?.message || 'Failed to complete student provisioning. Transaction was rolled back.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
