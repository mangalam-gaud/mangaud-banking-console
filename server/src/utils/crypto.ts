import crypto from 'crypto';

const KEYLEN = 32;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };

/** Derive a scrypt hash for a low-entropy secret such as a card PIN. */
export const hashSecret = (secret: string): string => {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(secret, salt, KEYLEN, SCRYPT_PARAMS).toString('hex');
  return `scrypt$${salt}$${derived}`;
};

/** Constant-time comparison so a wrong PIN can't be timed out character by character. */
export const verifySecret = (secret: string, stored?: string | null): boolean => {
  if (!stored) return false;
  const [scheme, salt, expected] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !expected) return false;

  const derived = crypto.scryptSync(secret, salt, KEYLEN, SCRYPT_PARAMS);
  const expectedBuf = Buffer.from(expected, 'hex');
  if (expectedBuf.length !== derived.length) return false;

  return crypto.timingSafeEqual(derived, expectedBuf);
};

/** Random numeric OTP, used by the password-reset flow. */
export const generateOtp = (length = 6): string => {
  const digits = '0123456789';
  let out = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    out += digits[bytes[i] % 10];
  }
  return out;
};

export default { hashSecret, verifySecret, generateOtp };
