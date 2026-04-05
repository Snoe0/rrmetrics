import { createMiddleware } from 'hono/factory';
import type { Env, AuthContext } from '../bindings';
import { createServiceClient } from '../lib/supabase';

type HonoEnv = {
  Bindings: Env;
  Variables: AuthContext;
};

const HEADER_THRESHOLD = 0.8; // Show headers at 80% usage

interface RateLimitResponse {
  allowed: boolean;
  count: number;
  resetAt: number;
  warning: boolean;
  limit: number;
}

export const rateLimitMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
  // Skip rate limiting for unauthenticated requests
  const user = c.get('user');
  if (!user) {
    return next();
  }

  let rlResult: RateLimitResponse;

  try {
    const id = c.env.RATE_LIMITER.idFromName(user.id);
    const stub = c.env.RATE_LIMITER.get(id);
    const resp = await stub.fetch(new Request('https://rate-limiter.internal/', {
      method: 'POST',
      body: JSON.stringify({ userId: user.id }),
    }));
    rlResult = await resp.json() as RateLimitResponse;
  } catch {
    // Fail open — if DO is unreachable, allow the request
    return next();
  }

  // Hard block: beyond grace period
  if (!rlResult.allowed) {
    const retryAfter = Math.ceil((rlResult.resetAt - Date.now()) / 1000);

    // Async log to Supabase
    c.executionCtx.waitUntil(
      logRateLimitEvent(c.env, user.id, rlResult.count, true, c.req.path),
    );

    return c.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: buildHeaders(rlResult, retryAfter) },
    );
  }

  // Continue to route handler
  await next();

  // Attach rate limit headers based on thresholds
  const usage = rlResult.count / rlResult.limit;

  if (rlResult.warning) {
    // Soft limit zone (61-63): add warning header + standard headers
    c.header('X-RateLimit-Warning', 'true');
    c.header('X-RateLimit-Limit', String(rlResult.limit));
    c.header('X-RateLimit-Remaining', String(Math.max(0, rlResult.limit - rlResult.count)));
    c.header('X-RateLimit-Reset', String(Math.ceil(rlResult.resetAt / 1000)));

    // Async log warning events
    c.executionCtx.waitUntil(
      logRateLimitEvent(c.env, user.id, rlResult.count, false, c.req.path),
    );
  } else if (usage >= HEADER_THRESHOLD) {
    // 80%+ usage: show headers so client can throttle
    c.header('X-RateLimit-Limit', String(rlResult.limit));
    c.header('X-RateLimit-Remaining', String(Math.max(0, rlResult.limit - rlResult.count)));
    c.header('X-RateLimit-Reset', String(Math.ceil(rlResult.resetAt / 1000)));
  }
});

function buildHeaders(rl: RateLimitResponse, retryAfter: number): Record<string, string> {
  return {
    'Retry-After': String(Math.max(1, retryAfter)),
    'X-RateLimit-Limit': String(rl.limit),
    'X-RateLimit-Remaining': '0',
    'X-RateLimit-Reset': String(Math.ceil(rl.resetAt / 1000)),
  };
}

async function logRateLimitEvent(
  env: Env,
  userId: string,
  requestCount: number,
  wasBlocked: boolean,
  endpoint: string,
): Promise<void> {
  try {
    const supabase = createServiceClient(env);
    await supabase.rpc('log_rate_limit_event', {
      p_user_id: userId,
      p_request_count: requestCount,
      p_was_blocked: wasBlocked,
      p_endpoint: endpoint,
    });
  } catch {
    // Best-effort logging — don't fail the request
  }
}
