/**
 * Secret-at-rest encryption helpers.
 *
 * Uses AES-256-GCM with a 32-byte key from env var SYLK_BANK_KEY (base64).
 * Format on disk: "enc:v1:<iv-b64>:<tag-b64>:<ciphertext-b64>"
 *
 * Backward compatibility: if input does NOT start with "enc:v1:" prefix,
 * it's treated as plaintext (legacy). decryptSecret returns as-is so the
 * system keeps working during the migration window.
 *
 * One-shot migration script: scripts/encrypt-teller-tokens.js
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const PREFIX = 'enc:v1:';

let cachedKey = null;

function getKey() {
  if (cachedKey) return cachedKey;
  const raw = process.env.SYLK_BANK_KEY;
  if (!raw) {
    throw new Error(
      'SYLK_BANK_KEY env var required for at-rest encryption (32-byte key, base64-encoded). ' +
        'Generate with: node -e "console.log(require(\\"crypto\\").randomBytes(32).toString(\\"base64\\"))"'
    );
  }
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    throw new Error(`SYLK_BANK_KEY must decode to 32 bytes, got ${buf.length}`);
  }
  cachedKey = buf;
  return buf;
}

function encryptSecret(plaintext) {
  if (plaintext == null || plaintext === '') return plaintext;
  if (typeof plaintext === 'string' && plaintext.startsWith(PREFIX)) {
    return plaintext;
  }
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return (
    PREFIX +
    iv.toString('base64') +
    ':' +
    tag.toString('base64') +
    ':' +
    enc.toString('base64')
  );
}

function decryptSecret(value) {
  if (value == null || value === '') return value;
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) {
    return value;
  }
  const parts = value.slice(PREFIX.length).split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted secret');
  }
  const [ivB64, tagB64, ctB64] = parts;
  const key = getKey();
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

module.exports = { encryptSecret, decryptSecret, isEncrypted };
