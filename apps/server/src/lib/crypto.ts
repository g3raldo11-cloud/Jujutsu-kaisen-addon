import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { hash, verify, type Algorithm } from '@node-rs/argon2';

// OWASP-recommended Argon2id parameters (m=19 MiB, t=2, p=1).
const ARGON_OPTS = { algorithm: 2 as Algorithm /* Argon2id */, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (password: string) => hash(password, ARGON_OPTS);

export async function verifyPassword(hashed: string | null | undefined, password: string) {
  if (!hashed) {
    // Spend comparable time for unknown accounts to avoid user enumeration by timing.
    await hash(password, ARGON_OPTS);
    return false;
  }
  try {
    return await verify(hashed, password);
  } catch {
    return false;
  }
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export const hmac = (secret: string, data: string, enc: 'hex' | 'base64' = 'base64') => createHmac('sha1', secret).update(data).digest(enc);

/** AES-256-GCM encryption for secrets stored at rest (TOTP secrets, API keys). */
export function encryptSecret(appSecret: string, plain: string) {
  const key = createHash('sha256').update(`enc:${appSecret}`).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${enc.toString('base64url')}`;
}

export function decryptSecret(appSecret: string, payload: string) {
  const [v, iv, tag, data] = payload.split('.');
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('Invalid secret payload');
  const key = createHash('sha256').update(`enc:${appSecret}`).digest();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}
