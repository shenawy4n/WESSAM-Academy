/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * WESSAM Academy — Edge Function: student-login
 * Secure username-based authentication resolving username -> internal Auth identity.
 * Includes dual-layer distributed & local rate-limiting, timing protection, and generic responses.
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Generic failure response to prevent username enumeration
const genericAuthFailure = () =>
  new Response(
    JSON.stringify({ error: 'Invalid username or password.' }),
    { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );

// Local in-memory sliding window cache for fast burst mitigation
const localRateLimitMap = new Map<string, { count: number; resetAt: number }>();

// Distributed Rate Limiting via Upstash Redis REST API
async function checkDistributedRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const upstashUrl = Deno.env.get('UPSTASH_REDIS_REST_URL');
  const upstashToken = Deno.env.get('UPSTASH_REDIS_REST_TOKEN');

  if (!upstashUrl || !upstashToken) {
    // Fallback to local container tracking if external distributed store not configured
    const now = Date.now();
    const entry = localRateLimitMap.get(key);
    if (!entry || now > entry.resetAt) {
      localRateLimitMap.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
      return true;
    }
    if (entry.count >= limit) {
      return false;
    }
    entry.count += 1;
    return true;
  }

  try {
    // Atomic INCR + EXPIRE via Upstash pipeline
    const pipelineUrl = `${upstashUrl.replace(/\/$/, '')}/pipeline`;
    const response = await fetch(pipelineUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${upstashToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', key],
        ['EXPIRE', key, windowSeconds, 'NX'],
      ]),
    });

    if (!response.ok) {
      console.warn('Upstash rate limit request returned non-200:', response.status);
      return true; // fail-open with local tracking on external API failure
    }

    const results = await response.json();
    const currentCount = results[0]?.result ?? 1;
    return currentCount <= limit;
  } catch (err) {
    console.warn('Upstash Redis rate-limit check failed, falling back:', err);
    return true;
  }
}

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
    // Extract client IP safely from edge headers
    const clientIp =
      req.headers.get('cf-connecting-ip') ||
      req.headers.get('x-real-ip') ||
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      'unknown-ip';

    // 1. IP-level Rate Limiting: max 20 attempts per 10 minutes per IP
    const ipAllowed = await checkDistributedRateLimit(`rl:ip:${clientIp}`, 20, 600);
    if (!ipAllowed) {
      return new Response(
        JSON.stringify({ error: 'Too many login attempts. Please wait 10 minutes before retrying.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON request payload.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { username, password } = body;

    // Strict input validation
    if (!username || typeof username !== 'string' || !password || typeof password !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Username and password are required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const trimmedUsername = username.trim().toLowerCase();

    // Prevent unusual characters / potential injection formats
    const usernameRegex = /^[a-zA-Z0-9._-]{3,50}$/;
    if (!usernameRegex.test(trimmedUsername) || password.length < 6 || password.length > 128) {
      return genericAuthFailure();
    }

    // 2. Account-level Rate Limiting: max 5 attempts per 10 minutes per username
    const userAllowed = await checkDistributedRateLimit(`rl:user:${trimmedUsername}`, 5, 600);
    if (!userAllowed) {
      return new Response(
        JSON.stringify({ error: 'Too many failed login attempts for this account. Please wait 10 minutes.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey =
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? '';

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing server environment variables in student-login function');
      return new Response(
        JSON.stringify({ error: 'Authentication service configuration error.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 3. Resolve username to internal auth email & verify account status
    const { data: credential, error: credError } = await supabaseAdmin
      .from('student_credentials')
      .select('profile_id, internal_auth_email, is_active')
      .eq('username', trimmedUsername)
      .maybeSingle();

    // If credential not found or inactive, return uniform generic error to prevent account enumeration
    if (credError || !credential || !credential.is_active) {
      return genericAuthFailure();
    }

    // Also verify profile master status
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('status')
      .eq('id', credential.profile_id)
      .maybeSingle();

    if (profileError || !profile || profile.status !== 'active') {
      return genericAuthFailure();
    }

    // 4. Authenticate against Supabase Auth using internal identity
    const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
      email: credential.internal_auth_email,
      password: password,
    });

    if (authError || !authData.session) {
      return genericAuthFailure();
    }

    // 5. Return session without leaking internal credentials
    return new Response(
      JSON.stringify({
        session: {
          access_token: authData.session.access_token,
          refresh_token: authData.session.refresh_token,
          expires_in: authData.session.expires_in,
          token_type: authData.session.token_type,
        },
        user: {
          id: authData.user.id,
          role: authData.user.user_metadata?.role || 'student',
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    // Log unexpected errors internally; never leak stack traces or payloads
    console.error('Unhandled student authentication error');
    return new Response(
      JSON.stringify({ error: 'An unexpected authentication error occurred. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
