import crypto from 'crypto';

/**
 * Human-quotable reference codes, e.g. `TXN-8KQ2-4F7A`.
 *
 * These are display identifiers, not secrets or unique keys — uniqueness is
 * still enforced by the database. The random block keeps codes from being
 * guessable/sequential, which matters for anything a customer reads aloud
 * (payment references, statement numbers).
 */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O/1/I

const randomBlock = (length: number): string => {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
};

export const generateReference = (prefix: string, blocks = 2, blockSize = 4): string => {
  const parts = Array.from({ length: blocks }, () => randomBlock(blockSize));
  return [prefix, ...parts].join('-');
};

export const referencePrefixes = {
  transaction: 'TXN',
  transfer: 'TRF',
  loan: 'LN',
  account: 'ACC',
  card: 'CRD',
  beneficiary: 'BEN',
  statement: 'STMT',
  ticket: 'TKT',
} as const;

/** Luhn check digit for a partial PAN (used to mint test card numbers). */
export const luhnCheckDigit = (partial: string): number => {
  let sum = 0;
  let double = true;
  for (let i = partial.length - 1; i >= 0; i--) {
    let d = Number(partial[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return (10 - (sum % 10)) % 10;
};

export default generateReference;
