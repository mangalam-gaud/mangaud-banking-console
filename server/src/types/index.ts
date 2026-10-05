/**
 * Canonical server-side types.
 *
 * Two layers live here:
 *
 *  1. Plain interfaces (User, Account, ...) describe the JSON that travels over
 *     the API: `id: string`, dates as ISO strings, optional virtuals.
 *     Controllers, services and middleware type their payloads with these.
 *
 *  2. `*Fields` interfaces describe the Mongoose *document* shape: `_id` is an
 *     ObjectId, dates are real `Date` objects, and schema-only fields such as
 *     `password` / `isActive` are present. Each model in src/models extends the
 *     matching `*Fields` interface plus `Document`.
 *
 * These are physically inside src/ rather than imported from the repo-root
 * `shared/` folder because `tsc` requires every source file to sit under
 * `rootDir` (server/src). Import them with the `@shared/types` path alias.
 */

import type { Types } from 'mongoose';

// ---------------------------------------------------------------------------
// Layer 1 - API / JSON shapes
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: 'customer' | 'admin' | 'manager';
  isActive?: boolean;
  isEmailVerified: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

export interface Customer {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  dateOfBirth?: string;
  kycStatus: 'pending' | 'verified' | 'rejected';
  kycDocuments: string[];
  createdAt: string;
  updatedAt: string;
}

export type AccountType = 'SAVINGS' | 'CURRENT' | 'SALARY';
export type AccountStatus = 'ACTIVE' | 'BLOCKED' | 'CLOSED';

export interface Account {
  id: string;
  customerId: string;
  accountNumber: string;
  accountType: AccountType;
  balance: number;
  interestRate: number;
  status: AccountStatus;
  currency: string;
  openedAt: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
  formattedBalance?: string;
  customer?: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
}

export type TransactionType =
  | 'OPENING_DEPOSIT'
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'LOAN_DISBURSEMENT'
  | 'LOAN_REPAYMENT'
  | 'INTEREST'
  | 'BALANCE_ADJUSTMENT';

export type TransactionStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REVERSED';

export interface Transaction {
  id: string;
  accountId: string;
  transactionType: TransactionType;
  amount: number;
  balanceAfter: number;
  relatedAccountId?: string;
  description?: string;
  status: TransactionStatus;
  reference: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  account?: { accountNumber: string };
  relatedAccount?: { accountNumber: string };
}

export type LoanStatus = 'APPLIED' | 'APPROVED' | 'DISBURSED' | 'CLOSED' | 'REJECTED';

export interface Loan {
  id: string;
  accountId: string;
  principalAmount: number;
  interestRate: number;
  termMonths: number;
  outstandingAmount: number;
  status: LoanStatus;
  appliedAt: string;
  approvedAt?: string;
  disbursedAt?: string;
  lastPaymentAt?: string;
  emiAmount?: number;
  nextDueDate?: string;
  createdAt: string;
  updatedAt: string;
  account?: { accountNumber: string; customerId: string };
  progressPercentage?: number;
  totalPaid?: number;
}

export interface LoanPayment {
  id: string;
  loanId: string;
  paymentAmount: number;
  principalPortion: number;
  interestPortion: number;
  paymentDate: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  reference: string;
  createdAt: string;
}

export interface SavingsInterestPosting {
  id: string;
  accountId: string;
  fromDate: string;
  toDate: string;
  interestAmount: number;
  postedAt: string;
}

export interface RefreshToken {
  id: string;
  userId: string;
  token: string;
  expiresAt: string;
  createdAt: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
    /** Notifications only. */
    unreadCount?: number;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface TransactionQuery {
  page?: number;
  limit?: number;
  accountId?: string;
  type?: string;
  fromDate?: string;
  toDate?: string;
  minAmount?: number;
  maxAmount?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface LoanQuery {
  page?: number;
  limit?: number;
  accountId?: string;
  status?: string;
}

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface DashboardStats {
  totalAccounts: number;
  totalBalance: number;
  totalLoans: number;
  totalOutstanding: number;
  recentTransactions: Transaction[];
}

// ---------------------------------------------------------------------------
// Layer 2 - Mongoose document field shapes
// ---------------------------------------------------------------------------

export interface IUserFields {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  /**
   * Must stay in sync with the `User.role` enum and with `ROLES` in
   * `config/permissions.ts`, which is the source of truth for what each role
   * may do.
   */
  role: 'customer' | 'teller' | 'loan_officer' | 'manager' | 'auditor' | 'admin';
  /** Branch the user belongs to; 'HO' is head office. */
  branchCode: string;
  isActive: boolean;
  isEmailVerified: boolean;
  lastLoginAt?: Date;
  fullName: string;
  comparePassword(candidatePassword: string): Promise<boolean>;
  // Added by the schema's `timestamps: true` option.
  createdAt: Date;
  updatedAt: Date;
}

export interface ICustomerFields {
  userId: Types.ObjectId;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  dateOfBirth?: Date;
  kycStatus: 'pending' | 'verified' | 'rejected';
  kycDocuments: string[];
  fullName: string;
  /**
   * Branch the customer is served by (`HO` = head office).
   *
   * This had to exist before branch scoping could: `User.branchCode` describes
   * where a member of *staff* works, which says nothing about which customers
   * and accounts they are allowed to see. Without a branch on the customer and
   * on the account, "a teller only sees their own branch" is unimplementable --
   * there is nothing to filter on, which is exactly why `BLR001` meant nothing
   * for as long as it did.
   */
  branchCode: string;
}

export interface IAccountFields {
  customerId: Types.ObjectId;
  /**
   * Denormalised from the owning customer at open time.
   *
   * Kept on the account as well as the customer so branch scoping is a single
   * indexed field on the hot path (`visibleAccountIds`) instead of a join
   * through Customer on every ledger read. The customer remains the source of
   * truth; this is a copy that must be written when the account is opened.
   */
  branchCode: string;
  accountNumber: string;
  accountType: AccountType;
  balance: number;
  interestRate: number;
  status: AccountStatus;
  currency: string;
  openedAt: Date;
  closedAt?: Date;
  /** Set when staff place a hold on the account; see `setAccountFrozen`. */
  frozenAt?: Date;
  unfrozenAt?: Date;
  frozenReason?: string;
  formattedBalance: string;
}

export interface ITransactionFields {
  accountId: Types.ObjectId;
  transactionType: TransactionType;
  amount: number;
  balanceAfter: number;
  relatedAccountId?: Types.ObjectId;
  /** Set when the counterparty is a saved payee outside this ledger. */
  beneficiaryId?: Types.ObjectId;
  counterparty?: {
    name?: string;
    accountNumber?: string;
    ifsc?: string;
    bankName?: string;
    upiId?: string;
  };
  description?: string;
  status: TransactionStatus;
  reference: string;
  metadata?: Record<string, unknown>;
  // Added by the schema's `timestamps: true` option.
  createdAt: Date;
  updatedAt: Date;
}

export interface ILoanFields {
  accountId: Types.ObjectId;
  principalAmount: number;
  interestRate: number;
  termMonths: number;
  outstandingAmount: number;
  status: LoanStatus;
  appliedAt: Date;
  approvedAt?: Date;
  disbursedAt?: Date;
  lastPaymentAt?: Date;
  emiAmount?: number;
  nextDueDate?: Date;
  payments?: ILoanPayment[];
  totalPaid?: number;
  progressPercentage?: number;
}

export interface ILoanPaymentFields {
  loanId: Types.ObjectId;
  paymentAmount: number;
  principalPortion: number;
  interestPortion: number;
  paymentDate: Date;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  reference: string;
}

export interface ISavingsInterestPostingFields {
  accountId: Types.ObjectId;
  fromDate: Date;
  toDate: Date;
  interestAmount: number;
  postedAt: Date;
}

export interface IRefreshTokenFields {
  userId: Types.ObjectId;
  token: string;
  expiresAt: Date;
}

// ---------------------------------------------------------------------------
// `I`-prefixed aliases to the API shapes, for call sites that use the
// Mongoose-ish naming convention (IUser, IAccount, IApiResponse, ...).
// ---------------------------------------------------------------------------
export type IUser = User;
export type ICustomer = Customer;
export type IAccount = Account;
export type ITransaction = Transaction;
export type ILoan = Loan;
export type ILoanPayment = LoanPayment;
export type ISavingsInterestPosting = SavingsInterestPosting;
export type IRefreshToken = RefreshToken;
export type IApiResponse<T = unknown> = ApiResponse<T>;
export type ITransactionQuery = TransactionQuery;
export type ILoanQuery = LoanQuery;
export type IAuthState = AuthState;
export type IDashboardStats = DashboardStats;
