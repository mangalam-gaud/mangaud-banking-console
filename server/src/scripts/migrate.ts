import mongoose from 'mongoose';
import config from '../config';
import connectDatabase from '../utils/database';
import logger from '../utils/logger';

const runMigrations = async (): Promise<void> => {
  try {
    await connectDatabase();

    logger.info('Running migrations...');

    await mongoose.connection.db?.collection('users').createIndex({ email: 1 }, { unique: true });
    await mongoose.connection.db?.collection('users').createIndex({ phone: 1 });
    await mongoose.connection.db?.collection('customers').createIndex({ userId: 1 }, { unique: true });
    await mongoose.connection.db?.collection('customers').createIndex({ email: 1 }, { unique: true });
    await mongoose.connection.db?.collection('customers').createIndex({ phone: 1 });
    await mongoose.connection.db?.collection('customers').createIndex({ kycStatus: 1 });
    await mongoose.connection.db?.collection('accounts').createIndex({ customerId: 1, status: 1 });
    await mongoose.connection.db?.collection('accounts').createIndex({ accountNumber: 1 }, { unique: true });
    await mongoose.connection.db?.collection('accounts').createIndex({ accountType: 1 });
    await mongoose.connection.db?.collection('transactions').createIndex({ accountId: 1, createdAt: -1 });
    await mongoose.connection.db?.collection('transactions').createIndex({ transactionType: 1 });
    await mongoose.connection.db?.collection('transactions').createIndex({ status: 1 });
    await mongoose.connection.db?.collection('transactions').createIndex({ reference: 1 }, { unique: true });
    await mongoose.connection.db?.collection('transactions').createIndex({ relatedAccountId: 1 });
    await mongoose.connection.db?.collection('transactions').createIndex({ createdAt: -1 });
    await mongoose.connection.db?.collection('loans').createIndex({ accountId: 1, status: 1 });
    await mongoose.connection.db?.collection('loans').createIndex({ status: 1 });
    await mongoose.connection.db?.collection('loans').createIndex({ nextDueDate: 1 });
    await mongoose.connection.db?.collection('loanpayments').createIndex({ loanId: 1, paymentDate: -1 });
    await mongoose.connection.db?.collection('loanpayments').createIndex({ reference: 1 }, { unique: true });
    await mongoose.connection.db?.collection('savingsinterestpostings').createIndex({ accountId: 1, fromDate: 1, toDate: 1 }, { unique: true });
    await mongoose.connection.db?.collection('refreshtokens').createIndex({ userId: 1 });
    await mongoose.connection.db?.collection('refreshtokens').createIndex({ token: 1 }, { unique: true });
    await mongoose.connection.db?.collection('refreshtokens').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await mongoose.connection.db?.collection('passwordresettokens').createIndex({ userId: 1 });
    await mongoose.connection.db?.collection('passwordresettokens').createIndex({ jti: 1 }, { unique: true });
    await mongoose.connection.db?.collection('passwordresettokens').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

    logger.info('Migrations completed successfully!');
  } catch (error) {
    logger.error('Migration error:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export default runMigrations;