import mongoose, { Document, Schema, Types } from 'mongoose';

export type NotificationCategory =
  | 'transaction'
  | 'account'
  | 'loan'
  | 'card'
  | 'security'
  | 'system';

export interface INotificationDocument extends Document {
  userId: Types.ObjectId;
  customerId?: Types.ObjectId;
  category: NotificationCategory;
  title: string;
  body: string;
  /** Optional deep link, e.g. `/transactions?ref=TXN-XXXX`. */
  link?: string;
  /** Domain id the notification was generated from, for dedupe. */
  referenceId?: string;
  priority: 'low' | 'normal' | 'high';
  read: boolean;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotificationDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      index: true,
    },
    category: {
      type: String,
      enum: ['transaction', 'account', 'loan', 'card', 'security', 'system'],
      default: 'system',
      index: true,
    },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    link: { type: String, trim: true },
    referenceId: { type: String, trim: true },
    priority: {
      type: String,
      enum: ['low', 'normal', 'high'],
      default: 'normal',
    },
    read: { type: Boolean, default: false, index: true },
    readAt: { type: Date },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// One notification per (user, reference) so a replayed job can't duplicate.
notificationSchema.index(
  { userId: 1, referenceId: 1 },
  { unique: true, partialFilterExpression: { referenceId: { $type: 'string' } } }
);
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, category: 1, createdAt: -1 });

export const Notification = mongoose.model<INotificationDocument>(
  'Notification',
  notificationSchema
);

export default Notification;
