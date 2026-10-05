// Shared TypeScript types between client and server

// User types
export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: 'customer' | 'admin' | 'manager';
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

// Account types
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

// Transaction types
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
  account?: {
    accountNumber: string;
  };
  relatedAccount?: {
    accountNumber: string;
  };
}

// Loan types
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
  account?: {
    accountNumber: string;
    customerId: string;
  };
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

// API Response types
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
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Query types
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

// Auth types
export interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
}

export interface OpenAccountData {
  accountType: 'SAVINGS' | 'CURRENT' | 'SALARY';
  initialDeposit?: number;
  currency?: string;
}

export interface DepositData {
  accountNumber: string;
  amount: number;
  description?: string;
}

export interface WithdrawData {
  accountNumber: string;
  amount: number;
  description?: string;
}

export interface TransferData {
  sourceAccountNumber: string;
  destinationAccountNumber: string;
  amount: number;
  description?: string;
}

export interface ApplyLoanData {
  accountNumber: string;
  principalAmount: number;
  interestRate: number;
  termMonths: number;
}

export interface RepayLoanData {
  loanId: string;
  amount: number;
}

export interface CalculateInterestData {
  accountNumber: string;
  fromDate: string;
  toDate: string;
}

export interface DashboardStats {
  totalAccounts: number;
  totalBalance: number;
  totalLoans: number;
  totalOutstanding: number;
  recentTransactions: Transaction[];
}