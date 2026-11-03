/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * WESSAM Academy — Edge Function: student-login
 * Secure username-based authentication resolving username -> internal Auth identity.
 * 
 * Distributed Rate-Limiting Architecture:
 * - Single atomic Redis Lua script executed via Upstash EVAL (zero interleave/race condition).
 * - HMAC-SHA-256 keyed hashing for IP and username cache keys to prevent PII leakage.
 * - Spoof-resistant IP extraction: cf-connecting-ip trusted ONLY when validated with cf-ray header.
 * - Bounded in-memory local fallback with LRU-style eviction to prevent container memory growth.
 * - Strict fail-closed / 503 behavior when production Redis is configured but unreachable.
 * - Explicit local-only warning logged when Redis is absent (e.g. dev environments).
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

// ------------------------------------------------------------------------------
// ATOMIC REDIS LUA SLIDING-WINDOW SCRIPT
// ------------------------------------------------------------------------------
const LUA_SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
local expire_sec = tonumber(ARGV[5])

local threshold = now - window_ms

-- 1. Purge entries outside sliding window
redis.call('ZREMRANGEBYSCORE', key, '-inf', threshold)

-- 2. Count active attempts
local current_count = redis.call('ZCARD', key)

if current_count < limit then
  -- Allowed: register current attempt and refresh TTL
  redis.call('ZADD', key, now, member)
  redis.call('EXPIRE', key, expire_sec)
  local remaining = limit - current_count - 1
  return { 1, remaining, 0 }
else
  -- Blocked: calculate retry-after seconds from oldest member in window
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retry_after = expire_sec
  if oldest and #oldest >= 2 then
    local oldest_ts = tonumber(oldest[2])
    if oldest_ts then
      retry_after = math.ceil((oldest_ts + window_ms - now) / 1000)
      if retry_after < 1 then retry_after = 1 end
    end
  end
  redis.call('EXPIRE', key, expire_sec)
  return { 0, 0, retry_after }
end
`;

// ------------------------------------------------------------------------------
// BOUNDED LOCAL IN-MEMORY TRACKING
// ------------------------------------------------------------------------------
interface LocalRateEntry {
  timestamps: number[];
  lastSeen: number;
}

const localSlidingWindows = new Map<string, LocalRateEntry>();
const MAX_LOCAL_ENTRIES = 2000;

function checkLocalSlidingLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const threshold = now - windowMs;

  // Cleanup expired entries periodically to prevent unbounded memory growth
  if (localSlidingWindows.size > MAX_LOCAL_ENTRIES) {
    for (const [k, v] of localSlidingWindows.entries()) {
      if (v.lastSeen < threshold) {
        localSlidingWindows.delete(k);
      }
    }
    // Hard cap eviction if still above threshold
    if (localSlidingWindows.size > MAX_LOCAL_ENTRIES) {
      const keysToDrop = Array.from(localSlidingWindows.keys()).slice(0, 500);
      for (const k of keysToDrop) localSlidingWindows.delete(k);
    }
  }

  const entry = localSlidingWindows.get(key) || { timestamps: [], lastSeen: now };
  const active = entry.timestamps.filter((ts) => ts > threshold);

  if (active.length >= limit) {
    const oldest = active[0] || threshold;
    const retryAfter = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    localSlidingWindows.set(key, { timestamps: active, lastSeen: now });
    return { allowed: false, retryAfter };
  }

  active.push(now);
  localSlidingWindows.set(key, { timestamps: active, lastSeen: now });
  return { allowed: true, retryAfter: 0 };
}

// ------------------------------------------------------------------------------
// HMAC-SHA-256 KEY HASHING
// ------------------------------------------------------------------------------
async function hmacSha256Hex(data: string): Promise<string> {
  const secret =
    Deno.env.get('RATE_LIMIT_HMAC_SECRET') ||
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
    'wessam-academy-default-salt-fallback';

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ------------------------------------------------------------------------------
// SPOOF-RESISTANT CLIENT IP EXTRACTION
// ------------------------------------------------------------------------------
function extractClientIp(req: Request): string {
  // Trust cf-connecting-ip ONLY when verified by Cloudflare cf-ray edge header
  const hasCfRay = req.headers.has('cf-ray');
  const cfIp = req.headers.get('cf-connecting-ip');
  if (hasCfRay && cfIp && cfIp.trim().length > 0) {
    return cfIp.trim();
  }

  // When not traversing validated Cloudflare edge, sanitize and flag unverified headers
  const xRealIp = req.headers.get('x-real-ip');
  if (xRealIp && /^[\d.:a-fA-F]+$/.test(xRealIp.trim())) {
    return `unverified:${xRealIp.trim()}`;
  }

  const xForwarded = req.headers.get('x-forwarded-for');
  if (xForwarded) {
    const first = xForwarded.split(',')[0]?.trim();
    if (first && /^[\d.:a-fA-F]+$/.test(first)) {
      return `unverified:${first}`;
    }
  }

  return 'peer:untrusted';
}

// ------------------------------------------------------------------------------
// ATOMIC SLIDING-WINDOW EVALUATOR
// ------------------------------------------------------------------------------
interface RateLimitResult {
  allowed: boolean;
  retryAfter: number;
  serviceError?: boolean;
}

async function evaluateAtomicRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const windowMs = windowSeconds * 1000;
  const now = Date.now();
  const upstashUrl = Deno.env.get('UPSTASH_REDIS_REST_URL');
  const upstashToken = Deno.env.get('UPSTASH_REDIS_REST_TOKEN');

  // Check bounded local sliding window first as an immediate defense-in-depth shield
  const localCheck = checkLocalSlidingLimit(key, limit, windowMs);
  if (!localCheck.allowed) {
    return { allowed: false, retryAfter: localCheck.retryAfter };
  }

  // If Upstash Redis is not configured (e.g. local dev), log clear warning and rely on local tracking
  if (!upstashUrl || !upstashToken) {
    console.warn('[SECURITY NOTICE] UPSTASH_REDIS_REST_URL not configured. Operating in local container fallback mode. Distributed multi-instance protection is NOT active.');
    return { allowed: true, retryAfter: 0 };
  }

  // Execute atomic Lua script via Upstash REST API command endpoint
  try {
    const memberId = `${now}-${crypto.randomUUID()}`;
    const endpoint = `${upstashUrl.replace(/\/$/, '')}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${upstashToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        'EVAL',
        LUA_SLIDING_WINDOW_SCRIPT,
        '1',
        key,
        String(now),
        String(windowMs),
        String(limit),
        memberId,
        String(windowSeconds),
      ]),
    });

    if (!response.ok) {
      console.error(`[SECURITY ALERT] Upstash Redis EVAL returned HTTP ${response.status}`);
      // Fail closed: Never treat a failed Redis request as an allowed check
      return { allowed: false, retryAfter: 60, serviceError: true };
    }

    const data = await response.json().catch(() => null);
    if (!data || data.error || !Array.isArray(data.result) || data.result.length < 3) {
      console.error('[SECURITY ALERT] Malformed Upstash Redis Lua response:', data?.error || data);
      return { allowed: false, retryAfter: 60, serviceError: true };
    }

    const [allowedCode, , retryAfter] = data.result;
    if (allowedCode === 1) {
      return { allowed: true, retryAfter: 0 };
    }

    return { allowed: false, retryAfter: Number(retryAfter) || windowSeconds };
  } catch (err) {
    console.error('[SECURITY ALERT] Failed to communicate with Upstash Redis cluster:', err);
    // Fail closed: Never treat connection failures as authorization to proceed
    return { allowed: false, retryAfter: 60, serviceError: true };
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
    const hashedIp = (await hmacSha256Hex(clientIp)).slice(0, 20);

    // 1. IP-level Atomic Rate Limiting: max 20 attempts per 10 minutes per IP
    const ipCheck = await evaluateAtomicRateLimit(`rl:ip:${hashedIp}`, 20, 600);
    if (!ipCheck.allowed) {
      if (ipCheck.serviceError) {
        return new Response(
          JSON.stringify({ error: 'Authentication service temporarily unavailable. Please retry in a moment.' }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' } }
        );
      }
      return new Response(
        JSON.stringify({
          error: `Too many login attempts from this network. Please wait ${ipCheck.retryAfter} seconds before retrying.`,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Retry-After': String(ipCheck.retryAfter),
          },
        }
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

    // 2. Account-level Atomic Rate Limiting: max 5 attempts per 10 minutes per username
    const hashedUser = (await hmacSha256Hex(trimmedUsername)).slice(0, 20);
    const userCheck = await evaluateAtomicRateLimit(`rl:u:${hashedUser}`, 5, 600);
    if (!userCheck.allowed) {
      if (userCheck.serviceError) {
        return new Response(
          JSON.stringify({ error: 'Authentication service temporarily unavailable. Please retry in a moment.' }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' } }
        );
      }
      return new Response(
        JSON.stringify({
          error: `Too many failed login attempts for this account. Please wait ${userCheck.retryAfter} seconds.`,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Retry-After': String(userCheck.retryAfter),
          },
        }
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
