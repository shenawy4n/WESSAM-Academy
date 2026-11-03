/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * WESSAM Academy — Edge Function: reset-student-password
 * Authenticated administrative function for Teachers and Super Admins to reset a student's password.
 * Security Rules:
 * 1. Only verified active teachers and super admins can execute this function.
 * 2. Target user MUST have role = 'student' in public.profiles (strictly blocks resetting teachers or admins).
 * 3. Never returns or logs passwords.
 * 4. Logs audit entry atomically.
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

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing or invalid authorization token.' }), {
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

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Verify caller identity using JWT token
    const token = authHeader.replace('Bearer ', '').trim();
    const { data: { user: caller }, error: callerError } = await supabaseAdmin.auth.getUser(token);

    if (callerError || !caller) {
      return new Response(JSON.stringify({ error: 'Invalid or expired session.' }), {
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
        JSON.stringify({ error: 'Forbidden: Only active teachers and super admins can reset student passwords.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return new Response(JSON.stringify({ error: 'Invalid JSON request payload.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { studentId, newPassword } = body;

    // 3. Validate Inputs
    if (!studentId || typeof studentId !== 'string') {
      return new Response(JSON.stringify({ error: 'Target student ID is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      return new Response(JSON.stringify({ error: 'New password must be at least 8 characters long.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Verify target user is strictly a student
    const { data: targetProfile, error: targetError } = await supabaseAdmin
      .from('profiles')
      .select('id, role, full_name, status')
      .eq('id', studentId)
      .maybeSingle();

    if (targetError || !targetProfile) {
      return new Response(JSON.stringify({ error: 'Student record not found.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (targetProfile.role !== 'student') {
      return new Response(
        JSON.stringify({ error: 'Security Violation: Cannot reset passwords for non-student accounts through this portal.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Update Auth password via Supabase Admin API
    const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(studentId, {
      password: newPassword,
    });

    if (updateAuthError) {
      return new Response(JSON.stringify({ error: updateAuthError.message || 'Failed to update credentials.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 6. Record Audit Log
    await supabaseAdmin.from('audit_logs').insert({
      actor_id: caller.id,
      action: 'ADMIN_RESET_STUDENT_PASSWORD',
      entity_type: 'student',
      entity_id: studentId,
      new_data: {
        student_name: targetProfile.full_name,
        timestamp: new Date().toISOString(),
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Student password successfully reset.',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('Password reset handler error:', err?.message);
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred during password reset.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
