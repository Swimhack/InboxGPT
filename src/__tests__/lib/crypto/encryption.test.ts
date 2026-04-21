import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, encryptJSON, decryptJSON } from '@/lib/crypto/encryption';

describe('encrypt / decrypt', () => {
  it('round-trips a simple string', () => {
    const plaintext = 'sk-ant-api03-test-key-12345';
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('round-trips an empty string', () => {
    const encrypted = encrypt('');
    expect(decrypt(encrypted)).toBe('');
  });

  it('round-trips unicode', () => {
    const text = 'Hello, world! Bonjour le monde!';
    const encrypted = encrypt(text);
    expect(decrypt(encrypted)).toBe(text);
  });

  it('produces different ciphertexts for the same plaintext (random IV)', () => {
    const plaintext = 'same-value';
    const a = encrypt(plaintext);
    const b = encrypt(plaintext);
    expect(a.equals(b)).toBe(false);
  });

  it('throws on corrupted buffer', () => {
    const encrypted = encrypt('test');
    // Corrupt the auth tag
    encrypted[15] = encrypted[15] ^ 0xff;
    expect(() => decrypt(encrypted)).toThrow();
  });

  it('throws on truncated buffer', () => {
    const encrypted = encrypt('test');
    const truncated = encrypted.subarray(0, 10);
    expect(() => decrypt(truncated)).toThrow();
  });
});

describe('encryptJSON / decryptJSON', () => {
  it('round-trips an object', () => {
    const data = { username: 'user@example.com', password: 'secret123' };
    const encrypted = encryptJSON(data);
    const decrypted = decryptJSON(encrypted);
    expect(decrypted).toEqual(data);
  });

  it('round-trips an array', () => {
    const data = [1, 2, 'three'];
    const encrypted = encryptJSON(data);
    const decrypted = decryptJSON(encrypted);
    expect(decrypted).toEqual(data);
  });
});
