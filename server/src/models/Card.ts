import mongoose, { Document, Schema, Types } from 'mongoose';
import { generateReference } from '../utils/reference';

/**
 * A card issued against an account. Kept deliberately generic (debit/credit)
 * so the same collection backs ATM cards, virtual cards and credit cards.
 */
export interface ICardDocument extends Document {
  cardNumber: string;
  cardholderName: string;
  accountId: Types.ObjectId;
  customerId: Types.ObjectId;
  type: 'DEBIT' | 'CREDIT' | 'VIRTUAL';
  network: 'VISA' | 'MASTERCARD' | 'RUPAY';
  status: 'ACTIVE' | 'FROZEN' | 'CANCELLED' | 'EXPIRED';
  expiryMonth: number;
  expiryYear: number;
  cvv: string;
  pinSet: boolean;
  dailyLimit: number;
  monthlyLimit: number;
  spentThisMonth: number;
  nickname?: string;
  colour: string;
  issuedAt: Date;
  lastUsedAt?: Date;
  frozenAt?: Date;
  frozenReason?: string;
  createdAt: Date;
  updatedAt: Date;
  // Schema virtuals, declared here so TypeScript sees them on the document.
  maskedNumber: string;
  expiryLabel: string;
  monthlyAvailable: number;
  /** scrypt hash of the 4-digit PIN; never the PIN itself. */
  pinHash?: string;
}

const cardSchema = new Schema<ICardDocument>(
  {
    cardNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    cardholderName: { type: String, required: true, trim: true, uppercase: true },
    accountId: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      required: true,
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['DEBIT', 'CREDIT', 'VIRTUAL'],
      default: 'DEBIT',
    },
    network: {
      type: String,
      enum: ['VISA', 'MASTERCARD', 'RUPAY'],
      default: 'VISA',
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'FROZEN', 'CANCELLED', 'EXPIRED'],
      default: 'ACTIVE',
      index: true,
    },
    expiryMonth: { type: Number, required: true, min: 1, max: 12 },
    expiryYear: { type: Number, required: true },
    cvv: { type: String, required: true, select: false },
    pinSet: { type: Boolean, default: false },
    /*
     * scrypt hash of the 4-digit PIN, never the PIN itself.
     *
     * This path used to be missing. The field was declared on the TypeScript
     * interface but not in the schema, and Mongoose runs `strict: true` by
     * default, so every `card.pinHash = ...` was silently dropped on save. The
     * API returned success and set `pinSet: true` while storing nothing, which
     * left the app claiming a PIN was configured when no PIN existed.
     *
     * `select: false` keeps the hash out of every ordinary read, so it cannot
     * leak through a list endpoint or an audit payload.
     */
    pinHash: { type: String, select: false },
    dailyLimit: { type: Number, default: 50000, min: 0 },
    monthlyLimit: { type: Number, default: 500000, min: 0 },
    spentThisMonth: { type: Number, default: 0, min: 0 },
    nickname: { type: String, trim: true },
    colour: { type: String, default: 'ink' },
    issuedAt: { type: Date, default: Date.now },
    lastUsedAt: { type: Date },
    frozenAt: { type: Date },
    frozenReason: { type: String },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

cardSchema.index({ customerId: 1, status: 1 });

/** Mask all but the last four digits, grouped in fours. */
cardSchema.virtual('maskedNumber').get(function (this: ICardDocument) {
  const last4 = this.cardNumber.slice(-4);
  return `•••• •••• •••• ${last4}`;
});

cardSchema.virtual('expiryLabel').get(function (this: ICardDocument) {
  const mm = String(this.expiryMonth).padStart(2, '0');
  return `${mm}/${String(this.expiryYear).slice(-2)}`;
});

/** Rupee amount still available under the monthly cap. */
cardSchema.virtual('monthlyAvailable').get(function (this: ICardDocument) {
  return Math.max(0, this.monthlyLimit - this.spentThisMonth);
});

export const Card = mongoose.model<ICardDocument>('Card', cardSchema);

/** Generates a Luhn-valid 16-digit PAN-style card number. */
export const generateCardNumber = (): string => {
  const BIN = '4532'; // Visa BIN used by the sandbox issuer
  let body = BIN;
  while (body.length < 15) {
    body += Math.floor(Math.random() * 10).toString();
  }
  return body + luhnCheckDigit(body);
};

export const luhnCheckDigit = (partial: string): number => {
  let sum = 0;
  let double = true; // the check digit position is even, so start doubled
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

export const generateCVV = (): string =>
  String(Math.floor(Math.random() * 9000) + 1000);

export const newReference = generateReference;
export default Card;
