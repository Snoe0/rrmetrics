/**
 * AES-256-GCM encryption using Web Crypto API.
 * Format-compatible with existing Node.js crypto output: iv:tag:ciphertext (all hex)
 */

const IV_LENGTH = 16;
const TAG_LENGTH = 16; // 128-bit auth tag

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function importKey(hexKey: string): Promise<CryptoKey> {
  if (!hexKey || hexKey.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  const keyBytes = hexToBytes(hexKey);
  return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function encrypt(text: string, encryptionKey: string): Promise<string> {
  const key = await importKey(encryptionKey);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(text);

  const ciphertextWithTag = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: TAG_LENGTH * 8 },
    key,
    encoded,
  );

  const result = new Uint8Array(ciphertextWithTag);
  // Web Crypto appends the tag at the end of ciphertext
  const ciphertext = result.slice(0, result.length - TAG_LENGTH);
  const tag = result.slice(result.length - TAG_LENGTH);

  return `${bytesToHex(iv)}:${bytesToHex(tag)}:${bytesToHex(ciphertext)}`;
}

export async function decrypt(encryptedString: string, encryptionKey: string): Promise<string> {
  const parts = encryptedString.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted string format');
  }

  const key = await importKey(encryptionKey);
  const iv = hexToBytes(parts[0]);
  const tag = hexToBytes(parts[1]);
  const ciphertext = hexToBytes(parts[2]);

  // Web Crypto expects tag appended to ciphertext
  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext, 0);
  combined.set(tag, ciphertext.length);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: TAG_LENGTH * 8 },
    key,
    combined,
  );

  return new TextDecoder().decode(decrypted);
}
