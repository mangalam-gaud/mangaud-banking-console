import mongoose, { Document, Schema, Types } from 'mongoose';

/**
 * Append-only trail of every state-changing operation.
 *
 * Entries are never updated or deleted by application code. The compound
 * index supports the "show me what this user did, newest first" query that
 * both the customer security page and the admin audit screen need.
 */
export interface IAuditLogDocument extends Document {
  actorId: Types.ObjectId;
  actorEmail: string;
  actorRole: string;
  action: string;
  entity: string;
  entityId?: string;
  status: 'SUCCESS' | 'FAILURE';
  ip?: string;
  userAgent?: string;
  /** Free-form, redacted context. Must never contain passwords or tokens. */
  metadata?: Record<string, unknown>;
  message?: string;
  createdAt: Date;
  updatedAt: Date;
}

const auditLogSchema = new Schema<IAuditLogDocument>(
  {
    actorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    actorEmail: { type: String, trim: true, lowercase: true, index: true },
    actorRole: { type: String, trim: true, index: true },
    action: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    entity: { type: String, required: true, trim: true, lowercase: true, index: true },
    entityId: { type: String, trim: true, index: true },
    status: {
      type: String,
      enum: ['SUCCESS', 'FAILURE'],
      default: 'SUCCESS',
      index: true,
    },
    ip: { type: String, trim: true },
    userAgent: { type: String, trim: true },
    metadata: { type: Schema.Types.Mixed },
    message: { type: String, trim: true },
  },
  {
    timestamps: true,
    // `strict: false` on the mixed map so callers can attach extra context
    // without a schema migration for every new field.
    strict: true,
  }
);

auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ entity: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

/**
 * Log entries are immutable. This guards against an accidental
 * `findOneAndUpdate` on the collection, which would defeat the point of an
 * audit trail.
 */
auditLogSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace'], function (
  next: (err?: Error) => void
) {
  next(new Error('Audit log entries are immutable'));
});

export const AuditLog = mongoose.model<IAuditLogDocument>('AuditLog', auditLogSchema);

export default AuditLog;
