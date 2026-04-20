import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 16;

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }

  // If key is hex encoded (64 chars = 32 bytes)
  if (key.length === 64) {
    return Buffer.from(key, 'hex');
  }

  // Otherwise, derive a key from the string
  const salt = Buffer.alloc(SALT_LENGTH, 'inboxpro-salt');
  return scryptSync(key, salt, 32);
}

export function encrypt(plaintext: string): Buffer {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  const authTag = cipher.getAuthTag();

  // Return: IV (12 bytes) + Auth Tag (16 bytes) + Encrypted Data
  return Buffer.concat([iv, authTag, encrypted]);
}

export function decrypt(encryptedBuffer: Buffer): string {
  const key = getKey();

  // Extract IV, Auth Tag, and Encrypted Data
  const iv = encryptedBuffer.subarray(0, IV_LENGTH);
  const authTag = encryptedBuffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = encryptedBuffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString('utf8');
}

export function encryptJSON<T>(data: T): Buffer {
  return encrypt(JSON.stringify(data));
}

export function decryptJSON<T>(encryptedBuffer: Buffer): T {
  return JSON.parse(decrypt(encryptedBuffer));
}

// Utility for encrypting credentials object

/** Stored in credentialsEncrypted for IMAP/SMTP accounts */
export interface ImapCredentials {
  username: string;
  password: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
}

/** Stored in credentialsEncrypted for OAuth accounts (Gmail, Outlook) */
export interface OAuthCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes?: string[];
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export function encryptCredentials(credentials: ImapCredentials): Buffer {
  return encryptJSON(credentials);
}

export function decryptCredentials(encryptedBuffer: Buffer): ImapCredentials {
  return decryptJSON<ImapCredentials>(encryptedBuffer);
}

export function encryptOAuthTokens(tokens: OAuthTokens): {
  accessToken: Buffer;
  refreshToken: Buffer;
} {
  return {
    accessToken: encrypt(tokens.accessToken),
    refreshToken: encrypt(tokens.refreshToken),
  };
}

export function decryptOAuthTokens(
  accessToken: Buffer,
  refreshToken: Buffer
): { accessToken: string; refreshToken: string } {
  return {
    accessToken: decrypt(accessToken),
    refreshToken: decrypt(refreshToken),
  };
}
