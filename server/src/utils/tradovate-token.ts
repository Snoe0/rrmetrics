import type { Env } from '../bindings';
import * as brokerDb from '../db/broker-connections';
import * as tvConnDb from '../db/tradovate-connections';
import { encrypt, decrypt } from './crypto';
import { TradovateAPI } from '../services/TradovateAPI';
import { getDb } from '../db/connection';

/** Threshold in ms — renew token if it expires within 30 minutes. */
const RENEWAL_THRESHOLD_MS = 30 * 60 * 1000;

/**
 * Ensures the stored Tradovate token for a broker connection is fresh.
 * If the token expires within 30 minutes, it is proactively renewed.
 * Returns the decrypted, valid access token and a TradovateAPI instance.
 */
export async function ensureFreshToken(
  env: Env,
  brokerConnectionId: string,
): Promise<{ token: string; api: TradovateAPI; environment: string }> {
  const serviceClient = getDb();

  const brokerConn = await brokerDb.findById(serviceClient, brokerConnectionId);
  if (!brokerConn) {
    throw new Error('Broker connection not found');
  }

  const tvConn = await tvConnDb.findByBrokerConnectionId(serviceClient, brokerConnectionId);
  if (!tvConn || !tvConn.access_token) {
    throw new Error('Tradovate not connected for this connection');
  }

  const api = new TradovateAPI(brokerConn.environment);
  const decryptedToken = await decrypt(tvConn.access_token, env.ENCRYPTION_KEY);
  const expiresAtMs = tvConn.token_expires_at ? new Date(tvConn.token_expires_at).getTime() : 0;
  const now = Date.now();

  // Token still has plenty of time — use as-is
  if (expiresAtMs - now > RENEWAL_THRESHOLD_MS) {
    return { token: decryptedToken, api, environment: brokerConn.environment };
  }

  // Token is within the renewal window (or already expired) — attempt renewal
  try {
    const { accessToken, expiresIn } = await api.renewAccessToken(decryptedToken);
    const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    await tvConnDb.updateByBrokerConnectionId(serviceClient, brokerConnectionId, {
      access_token: await encrypt(accessToken, env.ENCRYPTION_KEY),
      token_expires_at: newExpiresAt,
    });

    return { token: accessToken, api, environment: brokerConn.environment };
  } catch (err: any) {
    // If renewal fails but token hasn't fully expired yet, use the existing one
    if (expiresAtMs > now) {
      return { token: decryptedToken, api, environment: brokerConn.environment };
    }
    throw new Error('Tradovate session expired and renewal failed. Please reconnect your account.');
  }
}
