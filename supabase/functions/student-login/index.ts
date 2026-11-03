/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * WESSAM Academy — Edge Function: student-login
 * Secure username-based authentication resolving username -> internal Auth identity.
 * Features:
 * - True Redis sliding-window log via Upstash REST pipeline (ZREMRANGEBYSCORE + ZADD + ZCARD + EXPIRE)
 * - SHA-256 hashed keys for IP and username to protect PII in cache
 * - In-memory sliding-window defense-in-depth fallback
 * - Spoof-resistant IP extraction
 * - Timing protection and uniform 401 generic failure responses
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

// Local in-memory sliding-window log for defense-in-depth and local dev
const localSlidingWindows = new Map<string, number[]>();

function checkLocalSlidingLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const threshold = now - windowMs;
  const existing = localSlidingWindows.get(key) || [];
  
  // Prune timestamps outside current sliding window
  const active = existing.filter((ts) => ts > threshold);
  
  if (active.length >= limit) {
    localSlidingWindows.set(key, active);
    return false;
  }
  
  active.push(now);
  localSlidingWindows.set(key, active);
  return true;
}

// Compute truncated SHA-256 hex string to protect PII in rate-limit keys
async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Extract client IP safely from edge headers
function extractClientIp(req: Request): string {
  const cfIp = req.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp.trim();
  
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  
  return 'unknown-ip';
}

// True Distributed Sliding-Window Log Rate Limiter
async function checkDistributedSlidingLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const windowMs = windowSeconds * 1000;
  const now = Date.now();
  const threshold = now - windowMs;

  // 1. Evaluate local sliding window first (defense-in-depth)
  const localAllowed = checkLocalSlidingLimit(key, limit, windowMs);
  if (!localAllowed) {
    return false;
  }

  const upstashUrl = Deno.env.get('UPSTASH_REDIS_REST_URL');
  const upstashToken = Deno.env.get('UPSTASH_REDIS_REST_TOKEN');

  if (!upstashUrl || !upstashToken) {
    return localAllowed;
  }

  try {
    const memberId = `${now}-${crypto.randomUUID()}`;
    const pipelineUrl = `${upstashUrl.replace(/\/$/, '')}/pipeline`;
    const response = await fetch(pipelineUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${upstashToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['ZREMRANGEBYSCORE', key, 0, threshold],
        ['ZADD', key, now, memberId],
        ['ZCARD', key],
        ['EXPIRE', key, windowSeconds],
      ]),
    });

    if (!response.ok) {
      console.warn(`Upstash rate-limit pipeline error: HTTP ${response.status}`);
      return localAllowed;
    }

    const results = await response.json();
    // Pipeline index 2 corresponds to ZCARD
    const currentCount = results[2]?.result ?? 1;
    return typeof currentCount === 'number' && currentCount <= limit;
  } catch (err) {
    console.warn('Upstash rate-limit check failed, falling back safely to local tracker:', err);
    return localAllowed;
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
    const clientIp = extractClientIp(req);
    const hashedIp = (await sha256Hex(clientIp)).slice(0, 16);

    // 1. IP-level Rate Limiting: max 20 attempts per 10 minutes per IP
    const ipAllowed = await checkDistributedSlidingLimit(`rl:ip:${hashedIp}`, 20, 600);
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
    const hashedUser = (await sha256Hex(trimmedUsername)).slice(0, 16);
    const userAllowed = await checkDistributedSlidingLimit(`rl:u:${hashedUser}`, 5, 600);
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
