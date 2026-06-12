import crypto from 'node:crypto';

function resolveKey(tokenEncKey) {
  if (!tokenEncKey) {
    throw new Error('TOKEN_ENC_KEY is not configured');
  }

  if (/^[0-9a-fA-F]{64}$/.test(tokenEncKey)) {
    return Buffer.from(tokenEncKey, 'hex');
  }

  const key = Buffer.from(tokenEncKey, 'base64');
  if (key.length !== 32) {
    throw new Error('TOKEN_ENC_KEY must decode to 32 bytes (use 64-char hex or 44-char base64)');
  }

  return key;
}

export function encrypt(plaintext, tokenEncKey) {
  const key = resolveKey(tokenEncKey);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

export function decrypt(payload, tokenEncKey) {
  const key = resolveKey(tokenEncKey);
  const [ivB64, tagB64, dataB64] = String(payload).split(':');

  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Invalid encrypted payload format');
  }

  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
