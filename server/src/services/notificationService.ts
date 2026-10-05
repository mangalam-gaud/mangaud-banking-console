import { Notification, NotificationCategory } from '../models/Notification';
import { NotFoundError } from '../middleware/errorHandler';
import logger from '../utils/logger';

export interface NotificationInput {
  userId: string;
  customerId?: string;
  category: NotificationCategory;
  title: string;
  body: string;
  link?: string;
  /** Domain id (e.g. `TXN-8KQ2`) so retries can't duplicate a notification. */
  referenceId?: string;
  priority?: 'low' | 'normal' | 'high';
}

export interface NotificationView {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  link?: string;
  referenceId?: string;
  priority: string;
  read: boolean;
  readAt?: Date;
  createdAt: Date;
}

const toView = (doc: any): NotificationView => ({
  id: String(doc._id),
  category: doc.category,
  title: doc.title,
  body: doc.body,
  link: doc.link,
  referenceId: doc.referenceId,
  priority: doc.priority,
  read: doc.read,
  readAt: doc.readAt,
  createdAt: doc.createdAt,
});

/**
 * Create a notification, ignoring duplicates.
 *
 * Notifications are emitted from inside money-moving code paths, some of which
 * can be retried. A duplicate key on `referenceId` is a success, not a fault,
 * so `upsert` is used rather than `create`.
 */
export const notify = async (input: NotificationInput): Promise<void> => {
  try {
    await Notification.updateOne(
      { userId: input.userId, referenceId: input.referenceId },
      {
        $setOnInsert: {
          userId: input.userId,
          customerId: input.customerId,
          category: input.category,
          title: input.title,
          body: input.body,
          link: input.link,
          referenceId: input.referenceId,
          priority: input.priority || 'normal',
          read: false,
        },
      },
      { upsert: true }
    );
  } catch (error) {
    // A failed notification must never fail the transaction that triggered it.
    logger.warn('Could not record notification:', {
      error: error instanceof Error ? error.message : String(error),
      title: input.title,
    });
  }
};

export const getNotifications = async (
  userId: string,
  options: { page?: number; limit?: number; category?: string; unreadOnly?: boolean } = {}
): Promise<{ notifications: NotificationView[]; total: number; unreadCount: number; totalPages: number }> => {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));

  const query: Record<string, unknown> = { userId };
  if (options.category) query.category = options.category;
  if (options.unreadOnly) query.read = false;

  const [docs, total, unreadCount] = await Promise.all([
    Notification.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Notification.countDocuments(query),
    Notification.countDocuments({ userId, read: false }),
  ]);

  return {
    notifications: docs.map(toView),
    total,
    unreadCount,
    totalPages: Math.ceil(total / limit),
  };
};

export const getUnreadCount = async (userId: string): Promise<number> =>
  Notification.countDocuments({ userId, read: false });

export const markRead = async (
  userId: string,
  notificationId: string
): Promise<NotificationView> => {
  const doc = await Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { $set: { read: true, readAt: new Date() } },
    { new: true }
  );
  if (!doc) {
    throw new NotFoundError('Notification');
  }
  return toView(doc);
};

export const markAllRead = async (userId: string): Promise<{ updated: number }> => {
  const result = await Notification.updateMany(
    { userId, read: false },
    { $set: { read: true, readAt: new Date() } }
  );
  return { updated: result.modifiedCount ?? 0 };
};

export const removeNotification = async (
  userId: string,
  notificationId: string
): Promise<{ id: string }> => {
  const result = await Notification.deleteOne({ _id: notificationId, userId });
  if (!result.deletedCount) {
    throw new NotFoundError('Notification');
  }
  return { id: notificationId };
};

export const clearRead = async (userId: string): Promise<{ deleted: number }> => {
  const result = await Notification.deleteMany({ userId, read: true });
  return { deleted: result.deletedCount ?? 0 };
};

// ---------------------------------------------------------------- emitters

/** Notify a user that money left one of their accounts. */
export const notifyDebit = async (params: {
  userId: string;
  customerId?: string;
  amount: number;
  accountNumber: string;
  reference: string;
  counterparty: string;
}): Promise<void> => {
  await notify({
    userId: params.userId,
    customerId: params.customerId,
    category: 'transaction',
    title: `₹${params.amount.toLocaleString('en-IN')} debited`,
    body: `${params.counterparty} · A/C ${params.accountNumber.slice(-4)}`,
    link: `/transactions?ref=${params.reference}`,
    referenceId: `debit:${params.reference}`,
  });
};

export const notifyCredit = async (params: {
  userId: string;
  customerId?: string;
  amount: number;
  accountNumber: string;
  reference: string;
  counterparty: string;
}): Promise<void> => {
  await notify({
    userId: params.userId,
    customerId: params.customerId,
    category: 'transaction',
    title: `₹${params.amount.toLocaleString('en-IN')} credited`,
    body: `${params.counterparty} · A/C ${params.accountNumber.slice(-4)}`,
    link: `/transactions?ref=${params.reference}`,
    referenceId: `credit:${params.reference}`,
  });
};

export const notifySecurity = async (params: {
  userId: string;
  title: string;
  body: string;
  referenceId?: string;
}): Promise<void> => {
  await notify({
    userId: params.userId,
    category: 'security',
    title: params.title,
    body: params.body,
    link: '/security',
    referenceId: params.referenceId,
    priority: 'high',
  });
};

export const notifyLoan = async (params: {
  userId: string;
  customerId?: string;
  title: string;
  body: string;
  referenceId: string;
}): Promise<void> => {
  await notify({
    userId: params.userId,
    customerId: params.customerId,
    category: 'loan',
    title: params.title,
    body: params.body,
    link: '/loans',
    referenceId: params.referenceId,
  });
};

export default {
  notify,
  getNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  removeNotification,
  clearRead,
  notifyDebit,
  notifyCredit,
  notifySecurity,
  notifyLoan,
};
