import type { SessionData } from './bindings';

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Durable Object for server-side sessions.
 * Each session is its own DO instance, keyed by session ID.
 * Uses alarm() for automatic 24h sliding expiry.
 */
export class SessionDO implements DurableObject {
  private state: DurableObjectState;
  private data: SessionData | null = null;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const method = request.method;

    if (method === 'GET') {
      this.data = await this.state.storage.get<SessionData>('session') ?? null;
      if (!this.data) {
        return new Response(null, { status: 404 });
      }
      // Sliding expiry: reset alarm on each read
      await this.state.storage.setAlarm(Date.now() + SESSION_TTL_MS);
      return Response.json(this.data);
    }

    if (method === 'PUT') {
      this.data = await request.json<SessionData>();
      await this.state.storage.put('session', this.data);
      await this.state.storage.setAlarm(Date.now() + SESSION_TTL_MS);
      return new Response(null, { status: 204 });
    }

    if (method === 'DELETE') {
      await this.state.storage.deleteAll();
      this.data = null;
      return new Response(null, { status: 204 });
    }

    return new Response('Method not allowed', { status: 405 });
  }

  async alarm(): Promise<void> {
    // Session expired — clean up
    await this.state.storage.deleteAll();
    this.data = null;
  }
}
