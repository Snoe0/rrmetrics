import type { Env } from '../bindings';

/** Get the per-user Durable Object stub for the given account ID */
export function getUserDataStub(env: Env, accountId: string): DurableObjectStub {
  const id = env.USER_DATA.idFromName(accountId);
  return env.USER_DATA.get(id);
}
