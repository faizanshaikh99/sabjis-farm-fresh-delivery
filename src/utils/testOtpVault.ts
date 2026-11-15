import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const TEST_OTP_FILE = path.join(process.cwd(), 'backend-data', 'test_otp_events.json');

// Derive 32-byte key for AES-256-GCM encryption of test harness OTPs
const VAULT_KEY = crypto
  .createHash('sha256')
  .update(process.env.APP_SECRET || 'SabjiesOtpSecureTestRunnerVaultKey2026')
  .digest();

export interface EncryptedOtpRecord {
  enc: string;
  iv: string;
  tag: string;
  timestamp: number;
}

/**
 * Stores test OTP encrypted with AES-256-GCM.
 * Never stores or exposes plaintext OTP on disk or in logs.
 */
export function saveEncryptedOtp(identifier: string, otp: string) {
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', VAULT_KEY, iv);
    let enc = cipher.update(otp, 'utf8', 'hex');
    enc += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');

    const data: Record<string, EncryptedOtpRecord> = fs.existsSync(TEST_OTP_FILE)
      ? JSON.parse(fs.readFileSync(TEST_OTP_FILE, 'utf-8'))
      : {};

    // Purge records older than 15 minutes
    const now = Date.now();
    for (const key of Object.keys(data)) {
      if (!data[key]?.timestamp || now - data[key].timestamp > 15 * 60 * 1000) {
        delete data[key];
      }
    }

    data[identifier.trim().toLowerCase()] = {
      enc,
      iv: iv.toString('hex'),
      tag,
      timestamp: now
    };

    fs.writeFileSync(TEST_OTP_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Failed to save encrypted test OTP:', err);
  }
}

/**
 * Decrypts and retrieves OTP strictly for automated test runners.
 */
export function retrieveDecryptedOtp(identifier: string): string | null {
  try {
    if (!fs.existsSync(TEST_OTP_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(TEST_OTP_FILE, 'utf-8'));
    const record = data[identifier.trim().toLowerCase()];
    if (!record || !record.enc || !record.iv || !record.tag) return null;

    // Reject if expired (valid for 15 minutes)
    if (Date.now() - record.timestamp > 15 * 60 * 1000) {
      return null;
    }

    const iv = Buffer.from(record.iv, 'hex');
    const tag = Buffer.from(record.tag, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', VAULT_KEY, iv);
    decipher.setAuthTag(tag);
    let dec = decipher.update(record.enc, 'hex', 'utf8');
    dec += decipher.final('utf8');

    return dec;
  } catch {
    return null;
  }
}

/**
 * Resets test OTP store.
 */
export function resetTestOtpStore() {
  try {
    if (fs.existsSync(TEST_OTP_FILE)) {
      fs.writeFileSync(TEST_OTP_FILE, JSON.stringify({}));
    }
  } catch (err) {
    console.error('Failed to reset test OTP store:', err);
  }
}
