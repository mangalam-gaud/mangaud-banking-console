/**
 * Client-side domain types.
 *
 * These are defined locally rather than re-exported from the repo-root
 * `shared/` folder on purpose: Create React App's ModuleScopePlugin rejects any
 * import that resolves outside `client/src`, so a cross-package type import
 * cannot work in the CRA build. Keep this file in sync with
 * `shared/types.ts`, which the server uses.
 */

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: Role;
  /** Human-readable role, e.g. "Branch Manager". Shown instead of the raw slug. */
  roleLabel?: string;
  /** Branch the user belongs to. 'HO' is head office. */
  branchCode?: string;
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
export type AccountStatus = 'ACTIVE' | 'FROZEN' | 'BLOCKED' | 'CLOSED' | 'DORMANT';

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
  /** Set when the counterparty is a saved payee outside this ledger. */
  beneficiaryId?: string;
  /** Snapshot of the counterparty, kept even if the payee is later removed. */
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
    unreadCount?: number;
  };
}

// ------------------------------------------------------------------- cards

export type CardType = 'DEBIT' | 'CREDIT' | 'VIRTUAL';
export type CardNetwork = 'VISA' | 'MASTERCARD' | 'RUPAY';
export type CardStatus = 'ACTIVE' | 'FROZEN' | 'CANCELLED' | 'EXPIRED';

export interface BankCard {
  id: string;
  cardNumber: string;
  maskedNumber: string;
  cardholderName: string;
  accountId: string;
  accountNumber?: string;
  accountType?: string;
  type: CardType;
  network: CardNetwork;
  status: CardStatus;
  expiryMonth: number;
  expiryYear: number;
  expiryLabel: string;
  pinSet: boolean;
  dailyLimit: number;
  monthlyLimit: number;
  spentThisMonth: number;
  monthlyAvailable: number;
  nickname?: string;
  colour: string;
  issuedAt: string;
  lastUsedAt?: string;
  frozenAt?: string;
  frozenReason?: string;
}

export interface CardSummary {
  total: number;
  active: number;
  frozen: number;
  monthlySpend: number;
  monthlyAvailable: number;
}

// ------------------------------------------------------------ beneficiaries

export interface Beneficiary {
  id: string;
  name: string;
  accountNumber: string;
  maskedAccountNumber: string;
  ifsc: string;
  bankName: string;
  accountHolderName: string;
  accountType: 'SAVINGS' | 'CURRENT' | 'SALARY';
  upiId?: string;
  mobile?: string;
  email?: string;
  nickname?: string;
  isFavourite: boolean;
  dailyLimit: number;
  transferredTotal: number;
  transferCount: number;
  lastTransferredAt?: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
}

// -------------------------------------------------------------- statements

export interface StatementRow {
  date: string;
  reference: string;
  description: string;
  type: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface Statement {
  id: string;
  statementNumber: string;
  accountId: string;
  accountNumber: string;
  accountType?: string;
  fromDate: string;
  toDate: string;
  periodLabel: string;
  openingBalance: number;
  closingBalance: number;
  totalCredits: number;
  totalDebits: number;
  transactionCount: number;
  generatedAt: string;
}

// ----------------------------------------------------------- notifications

export type NotificationCategory =
  | 'transaction'
  | 'account'
  | 'loan'
  | 'card'
  | 'security'
  | 'system';

export interface AppNotification {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  link?: string;
  referenceId?: string;
  priority: 'low' | 'normal' | 'high';
  read: boolean;
  readAt?: string;
  createdAt: string;
}

// ------------------------------------------------------------------ audit

export interface AuditEntry {
  id: string;
  action: string;
  entity: string;
  status: 'SUCCESS' | 'FAILURE';
  message?: string;
  createdAt: string;
  actorEmail?: string;
  actorRole?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export interface ActiveSession {
  id: string;
  fingerprint: string;
  createdAt: string;
  expiresAt: string;
  current: boolean;
}

// ---------------------------------------------------------------- payments

export type PaymentChannel = 'NEFT' | 'IMPS' | 'RTGS' | 'UPI';

export interface PaymentResult {
  reference: string;
  amount: number;
  sourceAccount: { id: string; accountNumber: string; balance: number };
  beneficiary: {
    id: string;
    name: string;
    accountNumber: string;
    ifsc: string;
    bankName: string;
    upiId?: string;
  };
  channel: PaymentChannel;
  settledAt: string;
  estimatedArrival: string;
}

// ------------------------------------------------------------ deposits

export type DepositStatus = 'ACTIVE' | 'MATURED' | 'PREMATURELY_CLOSED';
export type InterestPayoutMode = 'MATURITY' | 'MONTHLY';

export interface FixedDeposit {
  id: string;
  reference: string;
  principal: number;
  interestRate: number;
  termMonths: number;
  interestAmount: number;
  maturityAmount: number;
  interestPayoutMode: InterestPayoutMode;
  status: DepositStatus;
  openedAt: string;
  maturesAt: string;
  maturedAt?: string;
  closedAt?: string;
  interestCredited?: number;
  earlyClosurePenalty?: number;
  closeReason?: string;
  sourceAccount?: { id: string; accountNumber: string; accountType?: string };
  daysToMaturity?: number;
}

/** A rate quote, returned before any money moves. */
export interface DepositQuote {
  principal: number;
  interestRate: number;
  termMonths: number;
  interestAmount: number;
  maturityAmount: number;
  maturityDate: string;
  taxNote: string;
}

// ------------------------------------------------- standing instructions

export type InstructionFrequency = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
export type InstructionStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'COMPLETED';

/**
 * Where the money goes. A single shape for both cases, tagged with `kind`,
 * because an instruction can debit to a saved payee or to another of the
 * customer's own accounts and the UI has to render both.
 */
export type InstructionDestination = {
  kind: 'BENEFICIARY' | 'ACCOUNT';
  id: string;
  label: string;
  detail?: string;
};

export interface StandingInstruction {
  id: string;
  reference: string;
  nickname: string;
  amount: number;
  frequency: InstructionFrequency;
  /** Pre-rendered, e.g. "Monthly on the 1st". Lets the server own the wording. */
  scheduleLabel: string;
  dayOfMonth: number;
  startDate: string;
  nextRunDate: string;
  lastRunAt?: string;
  status: InstructionStatus;
  runsCompleted: number;
  totalDebited: number;
  failureCount: number;
  lastFailureReason?: string;
  pausedAt?: string;
  pauseReason?: string;
  cancelledAt?: string;
  sourceAccount?: { accountNumber: string };
  destination?: InstructionDestination;
  isDue?: boolean;
}

// ------------------------------------------------------------- nominees

export type NomineeStatus = 'REGISTERED' | 'CANCELLED' | 'SUPERSEDED';

export interface Nominee {
  id: string;
  name: string;
  relationship: string;
  sharePercentage: number;
  dateOfBirth?: string;
  address?: string;
  mobile?: string;
  email?: string;
  identityProof?: string;
  status: NomineeStatus;
  registeredAt: string;
  /**
   * The account this nomination is registered against, as a flat field.
   *
   * Flat rather than a populated `account` sub-document on purpose: the
   * account number is denormalised onto the nominee at registration precisely
   * so it survives the account being closed, and a nomination is meaningless
   * without knowing which balance it points at.
   */
  accountNumber: string;
  /** Age in years, derived server-side from `dateOfBirth`. */
  age?: number;
}

// ------------------------------------------------------------------ KYC

export type KycStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'VERIFIED'
  | 'REJECTED'
  | 'EXPIRED';

export type KycRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface KycDocument {
  type: string;
  number?: string;
  verified: boolean;
  fileName?: string;
}

export interface KycDeclared {
  fullName: string;
  dateOfBirth: string;
  address: string;
  occupation: string;
  annualIncome: number;
  sourceOfFunds: string;
  politicallyExposed: boolean;
}

export interface KycSubmission {
  id: string;
  reference: string;
  status: KycStatus;
  documents: KycDocument[];
  declared: KycDeclared;
  addressProofType?: string;
  selfieVerified?: boolean;
  submittedAt: string;
  reviewedAt?: string;
  reviewedByName?: string;
  decisionNotes?: string;
  rejectionReasons?: string[];
  riskLevel?: KycRiskLevel;
  validUntil?: string;
  customer?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    kycStatus?: string;
  };
}

// --------------------------------------------------------------- RBAC

export type Role = 'customer' | 'teller' | 'loan_officer' | 'manager' | 'auditor' | 'admin';

export interface PermissionSet {
  role: Role;
  roleLabel: string;
  branchCode: string;
  isStaff: boolean;
  permissions: string[];
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
