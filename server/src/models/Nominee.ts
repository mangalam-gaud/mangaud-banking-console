import mongoose, { Document, Schema, Types } from 'mongoose';

/**
 * A person nominated to receive the balance if the account holder dies.
 *
 * A nomination is only legally effective once it is registered, so this is a
 * lifecycle (DRAFT -> REGISTERED -> CANCELLED) rather than a boolean. Percentages
 * must total 100; the service layer checks that on every write, because a
 * nomination totalling 90% is unenforceable.
 */
export interface INomineeDocument extends Document {
  customerId: Types.ObjectId;
  userId: Types.ObjectId;
  /** The account this nomination sits against. */
  accountId: Types.ObjectId;
  accountNumber: string;
  name: string;
  relationship: string;
  dateOfBirth: Date;
  address: string;
  mobile: string;
  email?: string;
  /** Share of the balance, 0-100. All nominees on an account must total 100. */
  sharePercentage: number;
  identityProof?: string;
  status: 'DRAFT' | 'REGISTERED' | 'CANCELLED';
  registeredAt?: Date;
  cancelledAt?: Date;
  cancellationReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const nomineeSchema = new Schema<INomineeDocument>(
  {
    // `index: true` is deliberately absent on `customerId` and `accountId`.
    // Both are declared as explicit `schema.index()` calls below, and declaring
    // them twice is what produced Mongoose's "Duplicate schema index" warning on
    // every boot. `userId` and `reference` keep the inline form because they
    // have no compound counterpart.
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    accountNumber: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    relationship: { type: String, required: true, trim: true, maxlength: 40 },
    dateOfBirth: { type: Date, required: true },
    address: { type: String, required: true, trim: true, maxlength: 250 },
    mobile: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    sharePercentage: {
      type: Number,
      required: true,
      min: [1, 'Share must be at least 1%'],
      max: [100, 'Share cannot exceed 100%'],
    },
    identityProof: { type: String, trim: true },
    status: {
      type: String,
      enum: ['DRAFT', 'REGISTERED', 'CANCELLED'],
      default: 'REGISTERED',
      index: true,
    },
    registeredAt: { type: Date, default: Date.now },
    cancelledAt: { type: Date },
    cancellationReason: { type: String, trim: true },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// One active nomination set per account. The partial filter keeps cancelled
// rows in history without blocking a re-registration.
nomineeSchema.index({ accountId: 1 }, { unique: true, partialFilterExpression: { status: { $in: ['DRAFT', 'REGISTERED'] } } });
nomineeSchema.index({ customerId: 1 });

export const Nominee = mongoose.model<INomineeDocument>('Nominee', nomineeSchema);

export default Nominee;
