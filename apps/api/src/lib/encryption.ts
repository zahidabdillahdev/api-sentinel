import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { config } from '../config.js';

function key() { if (!config.ENCRYPTION_KEY) throw new Error('ENCRYPTION_KEY is not configured'); return Buffer.from(config.ENCRYPTION_KEY, 'hex'); }
export function encrypt(value: string) { const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key(), iv); return { ciphertext: Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]).toString('base64'), iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64') }; }
export function decrypt(value: { ciphertext: string; iv: string; authTag: string }) { const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(value.iv, 'base64')); decipher.setAuthTag(Buffer.from(value.authTag, 'base64')); return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64')), decipher.final()]).toString('utf8'); }
