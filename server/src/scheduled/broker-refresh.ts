import type { Env } from '../bindings';
import { getDb } from '../db/connection';
import * as tvConnDb from '../db/tradovate-connections';
import * as pxConnDb from '../db/projectx-connections';
import * as brokerDb from '../db/broker-connections';
import { encrypt, decrypt } from '../utils/crypto';
import { TradovateAPI } from '../services/TradovateAPI';
import { ProjectXAPI } from '../services/ProjectXAPI';

export async function refreshExpiringBrokerTokens(env: Env): Promise<void> {
  const serviceClient = getDb();
  const threshold = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  // Tradovate token renewal
  try {
    const tvExpiring = await tvConnDb.findExpiringSoon(serviceClient, threshold);
    if (tvExpiring.length > 0) {
      console.log(`[Broker Cron] Renewing ${tvExpiring.length} Tradovate token(s)`);
      let renewed = 0, failed = 0;
      for (const row of tvExpiring) {
        try {
          const token = await decrypt(row.access_token!, env.ENCRYPTION_KEY);
          const api = new TradovateAPI(row.environment);
          const { accessToken, expiresIn } = await api.renewAccessToken(token);
          const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
          await tvConnDb.updateByBrokerConnectionId(serviceClient, row.broker_connection_id, {
            access_token: await encrypt(accessToken, env.ENCRYPTION_KEY),
            token_expires_at: newExpiresAt,
          });
          renewed++;
        } catch (err: any) {
          failed++;
          console.error(`[Broker Cron] Tradovate renewal failed for ${row.broker_connection_id}: ${err.message}`);
        }
      }
      console.log(`[Broker Cron] Tradovate: ${renewed} renewed, ${failed} failed`);
    }
  } catch (err: any) {
    console.error(`[Broker Cron] Tradovate query error: ${err.message}`);
  }

  // ProjectX token re-auth
  try {
    const pxExpiring = await pxConnDb.findExpiringSoon(serviceClient, threshold);
    if (pxExpiring.length > 0) {
      console.log(`[Broker Cron] Re-authenticating ${pxExpiring.length} ProjectX token(s)`);
      let renewed = 0, failed = 0;
      for (const row of pxExpiring) {
        try {
          if (!row.username || !row.api_key) { failed++; continue; }
          const apiKey = await decrypt(row.api_key, env.ENCRYPTION_KEY);
          const api = new ProjectXAPI();
          const newToken = await api.authenticate(row.username, apiKey);
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
          await pxConnDb.updateByBrokerConnectionId(serviceClient, row.broker_connection_id, {
            access_token: await encrypt(newToken, env.ENCRYPTION_KEY),
            token_expires_at: expiresAt,
          });
          renewed++;
        } catch (err: any) {
          failed++;
          console.error(`[Broker Cron] ProjectX re-auth failed for ${row.broker_connection_id}: ${err.message}`);
        }
      }
      console.log(`[Broker Cron] ProjectX: ${renewed} renewed, ${failed} failed`);
    }
  } catch (err: any) {
    console.error(`[Broker Cron] ProjectX query error: ${err.message}`);
  }

  // Cleanup pending OAuth connections older than 1 hour
  try {
    const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const cleaned = await brokerDb.cleanupPending(serviceClient, cutoff);
    if (cleaned > 0) {
      console.log(`[Broker Cron] Cleaned up ${cleaned} pending OAuth connection(s)`);
    }
  } catch (err: any) {
    console.error(`[Broker Cron] Pending cleanup error: ${err.message}`);
  }
}
