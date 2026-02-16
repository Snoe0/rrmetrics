import { createMiddleware } from 'hono/factory';
import type { Env, SessionData } from '../bindings';

/**
 * Session middleware: reads `sessionid` cookie, fetches session data from Durable Object,
 * and sets it on the Hono context variables.
 */
export const sessionMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: { session: SessionData | null; sessionId: string | null };
}>(async (c, next) => {
  const cookie = c.req.header('Cookie') || '';
  const match = cookie.match(/sessionid=([^;]+)/);
  const sessionId = match ? match[1] : null;

  if (!sessionId) {
    c.set('session', null);
    c.set('sessionId', null);
    return next();
  }

  try {
    const doId = c.env.SESSIONS.idFromName(sessionId);
    const stub = c.env.SESSIONS.get(doId);
    const response = await stub.fetch(new Request('https://session/get'));

    if (response.ok) {
      const data = await response.json<SessionData>();
      c.set('session', data);
      c.set('sessionId', sessionId);
    } else {
      c.set('session', null);
      c.set('sessionId', null);
    }
  } catch {
    c.set('session', null);
    c.set('sessionId', null);
  }

  return next();
});

/** Save session data to the Durable Object and set cookie */
export async function saveSession(
  env: Env,
  sessionId: string,
  data: SessionData,
): Promise<string> {
  const doId = env.SESSIONS.idFromName(sessionId);
  const stub = env.SESSIONS.get(doId);
  await stub.fetch(
    new Request('https://session/put', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  );

  return `sessionid=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24}`;
}

/** Destroy a session */
export async function destroySession(env: Env, sessionId: string): Promise<string> {
  const doId = env.SESSIONS.idFromName(sessionId);
  const stub = env.SESSIONS.get(doId);
  await stub.fetch(new Request('https://session/delete', { method: 'DELETE' }));
  return 'sessionid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
}

/** Generate a new session ID */
export function generateSessionId(): string {
  return crypto.randomUUID();
}
