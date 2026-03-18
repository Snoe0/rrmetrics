/**
 * Unsubscribe token generation and verification.
 * Token format: <userId>:<expiresAt>:<hmac>
 * HMAC = SHA-256(userId:expiresAt, ENCRYPTION_KEY)
 */

async function hmacSign(message: string, key: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate an unsubscribe token valid for 90 days.
 */
export async function generateUnsubscribeToken(
  userId: string,
  encryptionKey: string,
): Promise<string> {
  const expiresAt = Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60; // 90 days
  const hmac = await hmacSign(`${userId}:${expiresAt}`, encryptionKey);
  return `${userId}:${expiresAt}:${hmac}`;
}

/**
 * Verify an unsubscribe token. Returns the userId if valid, null if invalid/expired.
 */
export async function verifyUnsubscribeToken(
  token: string,
  encryptionKey: string,
): Promise<string | null> {
  const parts = token.split(':');
  if (parts.length !== 3) return null;

  const [userId, expiresAtStr, providedHmac] = parts;
  const expiresAt = parseInt(expiresAtStr, 10);
  if (isNaN(expiresAt)) return null;

  // Check expiry
  if (Date.now() / 1000 > expiresAt) return null;

  // Verify HMAC
  const expectedHmac = await hmacSign(`${userId}:${expiresAt}`, encryptionKey);
  if (providedHmac !== expectedHmac) return null;

  return userId;
}

/**
 * Build the full unsubscribe URL for embedding in emails.
 */
export async function buildUnsubscribeUrl(
  userId: string,
  appUrl: string,
  encryptionKey: string,
): Promise<string> {
  const token = await generateUnsubscribeToken(userId, encryptionKey);
  return `${appUrl}/api/email/unsubscribe?token=${encodeURIComponent(token)}`;
}
