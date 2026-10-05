import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import {
  ApiResponse,
  BankCard,
  CardSummary,
  Beneficiary,
  Statement,
  StatementRow,
  AppNotification,
  AuditEntry,
  ActiveSession,
  PaymentResult,
  FixedDeposit,
  StandingInstruction,
  Nominee,
  KycSubmission,
} from '../types';
import { tokenStorage } from './tokenStorage';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api/v1';

/*
 * Every request gets a deadline.
 *
 * Axios defaults to `timeout: 0`, which means "wait forever". That turns any
 * stalled connection - the server restarting, a half-open TCP socket, a proxy
 * that accepted the request and never answered - into a promise that never
 * settles. Because `AuthProvider` blocks the entire render on the session
 * check, one such request is not a slow page: it is a blank page, permanently,
 * with no error and nothing in the console.
 *
 * 20s is far longer than any call here legitimately takes (the API answers in
 * single-digit milliseconds on loopback), so it only ever fires on a genuine
 * stall. It exists to convert "never loads" into "something went wrong".
 */
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Endpoints where a 401 is an answer, not an expired session.
 *
 * On these paths a 401 means the credentials were rejected or the token was
 * already spent — which is the expected result of the request, not a signal that
 * the session died. They are excluded from the refresh-and-replay path so the
 * caller can show the message instead of the client reloading the page.
 */
const AUTH_401_IS_A_VERDICT = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/forgot-password',
  '/auth/reset-password',
];

class ApiService {
  private client: AxiosInstance;
  private refreshPromise: Promise<string> | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true,
      timeout: REQUEST_TIMEOUT_MS,
    });

    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        const accessToken = tokenStorage.getAccessToken();
        if (accessToken && config.headers) {
          config.headers.Authorization = `Bearer ${accessToken}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
        const url = originalRequest?.url ?? '';

        /*
          A 401 is not always an expired session.

          On `/auth/login`, `/register`, `/refresh`, `/forgot-password` and
          `/reset-password` a 401 is the *expected answer* — it means the
          credentials were wrong, or the token was already spent. The old code
          treated all of them as a dead session: no refresh token meant
          `clearAuth()` and `window.location.replace('/login')`.

          For the login screen that is a real bug with a visible symptom. The
          interceptor fired on the failed sign-in itself, hard-reloaded the page,
          and React remounted — so the "Invalid email or password" message the
          form had just set was destroyed before anyone could read it, along with
          whatever had been typed. The form appeared to do nothing at all on a
          wrong password, and the only evidence was a toast that vanished after
          four seconds.

          So these paths are excluded: the caller decides what a rejection means.
          Everything else keeps the refresh-and-replay behaviour.
        */
        const authEndpoint = AUTH_401_IS_A_VERDICT.some((path) => url.includes(path));

        // 401 -> try one refresh, then replay the original request once.
        if (error.response?.status === 401 && !originalRequest._retry && !authEndpoint) {
          // Nothing to refresh with: the session is genuinely gone. Clearing
          // here (rather than only after a failed refresh attempt) is what
          // stops the 401 -> refresh -> 401 -> ... loop.
          if (!tokenStorage.getRefreshToken()) {
            this.clearAuth();
            window.location.replace('/login');
            return Promise.reject(error);
          }

          originalRequest._retry = true;

          if (!this.refreshPromise) {
            this.refreshPromise = this.refreshAccessToken();
          }

          try {
            const newAccessToken = await this.refreshPromise;
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
            }
            return this.client(originalRequest);
          } catch (refreshError) {
            this.clearAuth();
            window.location.replace('/login');
            return Promise.reject(refreshError);
          } finally {
            this.refreshPromise = null;
          }
        }

        // A replayed request that 401s again means the session is dead; clear
        // once so the UI does not sit in a permanently "loading" state.
        if (error.response?.status === 401 && originalRequest._retry) {
          this.clearAuth();
        }

        return Promise.reject(error);
      }
    );
  }

  private async refreshAccessToken(): Promise<string> {
    const refreshToken = tokenStorage.getRefreshToken();
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await axios.post<ApiResponse<{ accessToken: string; refreshToken: string }>>(
      `${API_BASE_URL}/auth/refresh`,
      { refreshToken },
      { withCredentials: true }
    );

    if (response.data.success && response.data.data) {
      tokenStorage.setTokens(response.data.data.accessToken, response.data.data.refreshToken);
      return response.data.data.accessToken;
    }

    throw new Error('Failed to refresh token');
  }

  private clearAuth(): void {
    tokenStorage.clear();
  }

  async login(email: string, password: string, rememberMe = false): Promise<ApiResponse<{ user: any; tokens: { accessToken: string; refreshToken: string } }>> {
    const response = await this.client.post<ApiResponse<{ user: any; tokens: { accessToken: string; refreshToken: string } }>>('/auth/login', { email, password, rememberMe });
    if (response.data.success && response.data.data) {
      tokenStorage.setTokens(response.data.data.tokens.accessToken, response.data.data.tokens.refreshToken);
      tokenStorage.setUser(response.data.data.user);
    }
    return response.data;
  }

  async register(data: any): Promise<ApiResponse<{ user: any; tokens: { accessToken: string; refreshToken: string } }>> {
    const response = await this.client.post<ApiResponse<{ user: any; tokens: { accessToken: string; refreshToken: string } }>>('/auth/register', data);
    if (response.data.success && response.data.data) {
      tokenStorage.setTokens(response.data.data.tokens.accessToken, response.data.data.tokens.refreshToken);
      tokenStorage.setUser(response.data.data.user);
    }
    return response.data;
  }

  async logout(): Promise<void> {
    try {
      await this.client.post('/auth/logout');
    } finally {
      this.clearAuth();
    }
  }

  async getProfile(): Promise<ApiResponse<{ user: any }>> {
    const response = await this.client.get<ApiResponse<{ user: any }>>('/auth/profile');
    if (response.data.success && response.data.data) {
      tokenStorage.setUser(response.data.data.user);
    }
    return response.data;
  }

  async updateProfile(data: any): Promise<ApiResponse<{ user: any }>> {
    const response = await this.client.put<ApiResponse<{ user: any }>>('/auth/profile', data);
    if (response.data.success && response.data.data) {
      tokenStorage.setUser(response.data.data.user);
    }
    return response.data;
  }

  async changePassword(data: { currentPassword: string; newPassword: string }): Promise<ApiResponse> {
    return this.client.put<ApiResponse>('/auth/change-password', data).then(r => r.data);
  }

  async forgotPassword(email: string): Promise<ApiResponse> {
    return this.client.post<ApiResponse>('/auth/forgot-password', { email }).then(r => r.data);
  }

  async resetPassword(token: string, newPassword: string): Promise<ApiResponse> {
    return this.client.post<ApiResponse>('/auth/reset-password', { token, newPassword }).then(r => r.data);
  }

  async createAccount(data: { accountType: string; initialDeposit?: number; currency?: string; customerId?: string }): Promise<ApiResponse<{ account: any }>> {
    return this.client.post<ApiResponse<{ account: any }>>('/accounts', data).then(r => r.data);
  }

  /**
   * Counter customer search.
   *
   * Scoped by the server to the caller's branch, so this never reaches another
   * branch's customers no matter what is typed. `scopedToBranch` comes back so
   * the UI can explain an empty result ("no match in BLR001") rather than
   * showing a blank list that looks like a broken search.
   */
  async searchCustomers(q: string, limit?: number): Promise<ApiResponse<{ customers: any[]; scopedToBranch: string | null }>> {
    const params = new URLSearchParams({ q });
    if (limit) params.set('limit', String(limit));
    return this.client
      .get<ApiResponse<{ customers: any[]; scopedToBranch: string | null }>>(`/customers?${params.toString()}`)
      .then(r => r.data);
  }

  async getMyAccounts(): Promise<ApiResponse<{ accounts: any[] }>> {
    return this.client.get<ApiResponse<{ accounts: any[] }>>('/accounts/my-accounts').then(r => r.data);
  }

  async getAccount(accountNumber: string): Promise<ApiResponse<{ account: any }>> {
    return this.client.get<ApiResponse<{ account: any }>>(`/accounts/${accountNumber}`).then(r => r.data);
  }

  async getAllAccounts(params?: { page?: number; limit?: number; status?: string; accountType?: string; branchCode?: string }): Promise<ApiResponse<{ accounts: any[]; meta: any }>> {
    return this.client.get<ApiResponse<{ accounts: any[]; meta: any }>>('/accounts/all', { params }).then(r => r.data);
  }

  async deposit(data: { accountNumber: string; amount: number; description?: string }): Promise<ApiResponse<{ account: any }>> {
    return this.client.post<ApiResponse<{ account: any }>>('/accounts/deposit', data).then(r => r.data);
  }

  async withdraw(data: { accountNumber: string; amount: number; description?: string }): Promise<ApiResponse<{ account: any }>> {
    return this.client.post<ApiResponse<{ account: any }>>('/accounts/withdraw', data).then(r => r.data);
  }

  async transfer(data: { sourceAccountNumber: string; destinationAccountNumber: string; amount: number; description?: string }): Promise<ApiResponse<{ source: any; destination: any }>> {
    return this.client.post<ApiResponse<{ source: any; destination: any }>>('/accounts/transfer', data).then(r => r.data);
  }

  async checkBalance(accountNumber: string): Promise<ApiResponse<{ balance: number }>> {
    return this.client.get<ApiResponse<{ balance: number }>>(`/accounts/${accountNumber}/balance`).then(r => r.data);
  }

  async calculateInterest(data: { accountNumber: string; fromDate: string; toDate: string }): Promise<ApiResponse<{ interest: number }>> {
    return this.client.post<ApiResponse<{ interest: number }>>('/accounts/calculate-interest', data).then(r => r.data);
  }

  async applyInterest(data: { accountNumber: string; fromDate: string; toDate: string }): Promise<ApiResponse<{ interest: number }>> {
    return this.client.post<ApiResponse<{ interest: number }>>('/accounts/apply-interest', data).then(r => r.data);
  }

  async closeAccount(accountNumber: string): Promise<ApiResponse> {
    return this.client.delete<ApiResponse>(`/accounts/${accountNumber}`).then(r => r.data);
  }

  async applyLoan(data: { accountNumber: string; principalAmount: number; interestRate: number; termMonths: number }): Promise<ApiResponse<{ loan: any }>> {
    return this.client.post<ApiResponse<{ loan: any }>>('/loans', data).then(r => r.data);
  }

  async getMyLoans(): Promise<ApiResponse<{ loans: any[] }>> {
    return this.client.get<ApiResponse<{ loans: any[] }>>('/loans/my-loans').then(r => r.data);
  }

  async getLoan(loanId: string): Promise<ApiResponse<{ loan: any; payments: any[] }>> {
    return this.client.get<ApiResponse<{ loan: any; payments: any[] }>>(`/loans/${loanId}`).then(r => r.data);
  }

  async getAllLoans(params?: { page?: number; limit?: number; status?: string }): Promise<ApiResponse<{ loans: any[]; meta: any }>> {
    return this.client.get<ApiResponse<{ loans: any[]; meta: any }>>('/loans/all', { params }).then(r => r.data);
  }

  async approveLoan(loanId: string): Promise<ApiResponse<{ loan: any }>> {
    return this.client.post<ApiResponse<{ loan: any }>>(`/loans/${loanId}/approve`).then(r => r.data);
  }

  async disburseLoan(loanId: string): Promise<ApiResponse<{ loan: any }>> {
    return this.client.post<ApiResponse<{ loan: any }>>(`/loans/${loanId}/disburse`).then(r => r.data);
  }

  async repayLoan(data: { loanId: string; amount: number; fromAccountId?: string }): Promise<ApiResponse<{ loan: any }>> {
    return this.client
      .post<ApiResponse<{ loan: any }>>(`/loans/${data.loanId}/repay`, {
        amount: data.amount,
        // Which of the borrower's own accounts pays. Omitted, the loan's own
        // account is debited — which is what this always did.
        ...(data.fromAccountId ? { fromAccountId: data.fromAccountId } : {}),
      })
      .then(r => r.data);
  }

  async calculateLoanInterest(data: { loanId: string; fromDate: string; toDate: string }): Promise<ApiResponse<{ interest: number }>> {
    return this.client.post<ApiResponse<{ interest: number }>>('/loans/calculate-interest', data).then(r => r.data);
  }

  async getLoanPayments(loanId: string): Promise<ApiResponse<{ payments: any[] }>> {
    return this.client.get<ApiResponse<{ payments: any[] }>>(`/loans/${loanId}/payments`).then(r => r.data);
  }

  async getOverdueLoans(): Promise<ApiResponse<{ loans: any[] }>> {
    return this.client.get<ApiResponse<{ loans: any[] }>>('/loans/overdue').then(r => r.data);
  }

  async getTransactions(params?: any): Promise<ApiResponse<{ transactions: any[]; meta: any }>> {
    return this.client.get<ApiResponse<{ transactions: any[]; meta: any }>>('/transactions', { params }).then(r => r.data);
  }

  async getTransaction(transactionId: string): Promise<ApiResponse<{ transaction: any }>> {
    return this.client.get<ApiResponse<{ transaction: any }>>(`/transactions/${transactionId}`).then(r => r.data);
  }

  async getMiniStatement(accountNumber: string, limit = 10): Promise<ApiResponse<{ transactions: any[] }>> {
    return this.client.get<ApiResponse<{ transactions: any[] }>>(`/transactions/statement/${accountNumber}`, { params: { limit } }).then(r => r.data);
  }

  async getAccountSummary(accountId: string): Promise<ApiResponse<any>> {
    return this.client.get<ApiResponse<any>>(`/transactions/summary/${accountId}`).then(r => r.data);
  }

  async getTransactionStats(): Promise<ApiResponse<any>> {
    return this.client.get<ApiResponse<any>>('/transactions/stats').then(r => r.data);
  }

  // ------------------------------------------------------------------ cards

  async getCards(): Promise<ApiResponse<{ cards: BankCard[] }>> {
    return this.client.get<ApiResponse<{ cards: BankCard[] }>>('/cards').then(r => r.data);
  }

  async getCardSummary(): Promise<ApiResponse<{ summary: CardSummary }>> {
    return this.client.get<ApiResponse<{ summary: CardSummary }>>('/cards/summary').then(r => r.data);
  }

  async getAllCards(params?: { page?: number; limit?: number; status?: string; type?: string }): Promise<ApiResponse<{ cards: BankCard[] }>> {
    return this.client.get<ApiResponse<{ cards: BankCard[] }>>('/cards/all', { params }).then(r => r.data);
  }

  async getCard(cardId: string): Promise<ApiResponse<{ card: BankCard }>> {
    return this.client.get<ApiResponse<{ card: BankCard }>>(`/cards/${cardId}`).then(r => r.data);
  }

  async issueCard(data: {
    accountId: string;
    type?: string;
    network?: string;
    nickname?: string;
  }): Promise<ApiResponse<{ card: BankCard; credentials: { cardNumber: string; cvv: string; expiryLabel: string } }>> {
    return this.client
      .post<ApiResponse<{ card: BankCard; credentials: { cardNumber: string; cvv: string; expiryLabel: string } }>>('/cards', data)
      .then(r => r.data);
  }

  async freezeCard(cardId: string, reason?: string): Promise<ApiResponse<{ card: BankCard }>> {
    return this.client.post<ApiResponse<{ card: BankCard }>>(`/cards/${cardId}/freeze`, { reason }).then(r => r.data);
  }

  async unfreezeCard(cardId: string): Promise<ApiResponse<{ card: BankCard }>> {
    return this.client.post<ApiResponse<{ card: BankCard }>>(`/cards/${cardId}/unfreeze`).then(r => r.data);
  }

  async cancelCard(cardId: string): Promise<ApiResponse<{ card: BankCard }>> {
    return this.client.post<ApiResponse<{ card: BankCard }>>(`/cards/${cardId}/cancel`).then(r => r.data);
  }

  async updateCardLimits(
    cardId: string,
    limits: { dailyLimit?: number; monthlyLimit?: number }
  ): Promise<ApiResponse<{ card: BankCard }>> {
    return this.client.patch<ApiResponse<{ card: BankCard }>>(`/cards/${cardId}/limits`, limits).then(r => r.data);
  }

  async renameCard(cardId: string, nickname: string): Promise<ApiResponse<{ card: BankCard }>> {
    return this.client.patch<ApiResponse<{ card: BankCard }>>(`/cards/${cardId}/nickname`, { nickname }).then(r => r.data);
  }

  async setCardPin(cardId: string, pin: string): Promise<ApiResponse<{ card: BankCard }>> {
    return this.client.post<ApiResponse<{ card: BankCard }>>(`/cards/${cardId}/pin`, { pin }).then(r => r.data);
  }

  async revealCard(cardId: string): Promise<ApiResponse<{ credentials: { cardNumber: string; cvv: string; expiryLabel: string } }>> {
    return this.client
      .get<ApiResponse<{ credentials: { cardNumber: string; cvv: string; expiryLabel: string } }>>(`/cards/${cardId}/reveal`)
      .then(r => r.data);
  }

  // ---------------------------------------------------------- beneficiaries

  async getBeneficiaries(): Promise<ApiResponse<{ beneficiaries: Beneficiary[] }>> {
    return this.client.get<ApiResponse<{ beneficiaries: Beneficiary[] }>>('/beneficiaries').then(r => r.data);
  }

  async addBeneficiary(data: {
    name: string;
    accountNumber: string;
    ifsc: string;
    bankName: string;
    accountHolderName: string;
    accountType?: string;
    upiId?: string;
    mobile?: string;
    email?: string;
    nickname?: string;
  }): Promise<ApiResponse<{ beneficiary: Beneficiary }>> {
    return this.client.post<ApiResponse<{ beneficiary: Beneficiary }>>('/beneficiaries', data).then(r => r.data);
  }

  async updateBeneficiary(
    beneficiaryId: string,
    patch: Partial<{
      name: string;
      nickname: string;
      isFavourite: boolean;
      dailyLimit: number;
      status: string;
      upiId: string;
      mobile: string;
      email: string;
    }>
  ): Promise<ApiResponse<{ beneficiary: Beneficiary }>> {
    return this.client.patch<ApiResponse<{ beneficiary: Beneficiary }>>(`/beneficiaries/${beneficiaryId}`, patch).then(r => r.data);
  }

  async removeBeneficiary(beneficiaryId: string): Promise<ApiResponse> {
    return this.client.delete<ApiResponse>(`/beneficiaries/${beneficiaryId}`).then(r => r.data);
  }

  // --------------------------------------------------------------- payments

  async previewPayment(amount: number): Promise<ApiResponse<{ preview: { channel: string; arrival: string; fee: number } }>> {
    return this.client.post<ApiResponse<{ preview: { channel: string; arrival: string; fee: number } }>>('/payments/preview', { amount }).then(r => r.data);
  }

  async payBeneficiary(data: {
    sourceAccountId: string;
    beneficiaryId: string;
    amount: number;
    note?: string;
  }): Promise<ApiResponse<{ payment: PaymentResult }>> {
    return this.client.post<ApiResponse<{ payment: PaymentResult }>>('/payments', data).then(r => r.data);
  }

  async recordIncoming(data: {
    accountId: string;
    amount: number;
    from: string;
    reference?: string;
    note?: string;
  }): Promise<ApiResponse<any>> {
    return this.client.post<ApiResponse<any>>('/payments/incoming', data).then(r => r.data);
  }

  async reversePayment(transactionId: string, reason?: string): Promise<ApiResponse<any>> {
    return this.client.post<ApiResponse<any>>(`/payments/${transactionId}/reverse`, { reason }).then(r => r.data);
  }

  // ---------------------------------------------------------- notifications

  async getNotifications(params?: {
    page?: number;
    limit?: number;
    category?: string;
    unreadOnly?: boolean;
  }): Promise<ApiResponse<{ notifications: AppNotification[] }>> {
    return this.client
      .get<ApiResponse<{ notifications: AppNotification[] }>>('/notifications', { params })
      .then(r => r.data);
  }

  async getUnreadNotificationCount(): Promise<number> {
    const res = await this.client.get<ApiResponse<{ count: number }>>('/notifications/unread-count');
    return res.data.data?.count ?? 0;
  }

  async markNotificationRead(notificationId: string): Promise<ApiResponse<any>> {
    return this.client.post<ApiResponse<any>>(`/notifications/${notificationId}/read`).then(r => r.data);
  }

  async markAllNotificationsRead(): Promise<ApiResponse<any>> {
    return this.client.post<ApiResponse<any>>('/notifications/mark-all-read').then(r => r.data);
  }

  async removeNotification(notificationId: string): Promise<ApiResponse> {
    return this.client.delete<ApiResponse>(`/notifications/${notificationId}`).then(r => r.data);
  }

  async clearReadNotifications(): Promise<ApiResponse<any>> {
    return this.client.delete<ApiResponse<any>>('/notifications/clear-read').then(r => r.data);
  }

  // ------------------------------------------------------------- statements

  async getStatements(params?: {
    page?: number;
    limit?: number;
    accountId?: string;
    /**
     * The customer to list for, when the caller is staff.
     *
     * A customer is always resolved from their own session server-side and this
     * is ignored for them, so it is safe to send unconditionally.
     */
    customerId?: string;
  }): Promise<ApiResponse<{ statements: Statement[] }>> {
    return this.client.get<ApiResponse<{ statements: Statement[] }>>('/statements', { params }).then(r => r.data);
  }

  async generateStatement(data: {
    accountId: string;
    fromDate: string;
    toDate: string;
    /** Required for staff, ignored for a customer. See `getStatements`. */
    customerId?: string;
  }): Promise<ApiResponse<{ statement: Statement; rows: StatementRow[] }>> {
    return this.client.post<ApiResponse<{ statement: Statement; rows: StatementRow[] }>>('/statements/generate', data).then(r => r.data);
  }

  async getStatement(statementId: string): Promise<ApiResponse<{ statement: Statement; rows: StatementRow[] }>> {
    return this.client.get<ApiResponse<{ statement: Statement; rows: StatementRow[] }>>(`/statements/${statementId}`).then(r => r.data);
  }

  /** Returns the CSV as a Blob so the caller can save it. */
  async downloadStatementCsv(statementId: string): Promise<Blob> {
    const response = await this.client.get(`/statements/${statementId}/download`, { responseType: 'blob' });
    return response.data as Blob;
  }

  // ------------------------------------------------------- security & audit

  async getMySecurityLog(params?: { page?: number; limit?: number }): Promise<ApiResponse<{ entries: AuditEntry[] }>> {
    return this.client.get<ApiResponse<{ entries: AuditEntry[] }>>('/audit/security', { params }).then(r => r.data);
  }

  async getAuditLog(params?: {
    page?: number;
    limit?: number;
    entity?: string;
    action?: string;
    status?: string;
    actorId?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<ApiResponse<{ entries: AuditEntry[] }>> {
    return this.client.get<ApiResponse<{ entries: AuditEntry[] }>>('/audit', { params }).then(r => r.data);
  }

  async getActiveSessions(): Promise<ApiResponse<{ sessions: ActiveSession[] }>> {
    return this.client.get<ApiResponse<{ sessions: ActiveSession[] }>>('/audit/sessions').then(r => r.data);
  }

  async revokeSession(sessionId: string): Promise<ApiResponse> {
    return this.client.delete<ApiResponse>(`/audit/sessions/${sessionId}`).then(r => r.data);
  }

  async revokeAllSessions(): Promise<ApiResponse> {
    return this.client.delete<ApiResponse>('/audit/sessions').then(r => r.data);
  }

  // ---------------------------------------------------------------- RBAC

  /**
   * The signed-in user's capability list.
   *
   * Fetched rather than derived from a client-side role table, so the UI hides
   * exactly what the server would refuse. A duplicated role table in the client
   * is a second source of truth that drifts the first time a permission moves.
   */
  async getPermissions(): Promise<
    ApiResponse<{
      role: string;
      roleLabel: string;
      branchCode: string;
      isStaff: boolean;
      permissions: string[];
    }>
  > {
    return this.client
      .get<
        ApiResponse<{
          role: string;
          roleLabel: string;
          branchCode: string;
          isStaff: boolean;
          permissions: string[];
        }>
      >('/auth/permissions')
      .then(r => r.data);
  }

  // ------------------------------------------------------- fixed deposits

  async quoteDeposit(data: {
    principal: number;
    termMonths: number;
  }): Promise<
    ApiResponse<{
      quote: {
        principal: number;
        interestRate: number;
        termMonths: number;
        interestAmount: number;
        maturityAmount: number;
        maturityDate: string;
        taxNote: string;
      };
    }>
  > {
    return this.client
      .get<ApiResponse<{ quote: any }>>('/banking/deposits/quote', { params: data })
      .then(r => r.data);
  }

  async getDeposits(): Promise<ApiResponse<{ deposits: FixedDeposit[] }>> {
    return this.client.get<ApiResponse<{ deposits: FixedDeposit[] }>>('/banking/deposits').then(r => r.data);
  }

  async openDeposit(data: {
    sourceAccountId: string;
    principal: number;
    termMonths: number;
    interestPayoutMode?: 'MATURITY' | 'MONTHLY';
  }): Promise<ApiResponse<{ deposit: FixedDeposit }>> {
    return this.client
      .post<ApiResponse<{ deposit: FixedDeposit }>>('/banking/deposits', data)
      .then(r => r.data);
  }

  async closeDeposit(
    depositId: string,
    reason?: string
  ): Promise<ApiResponse<{ deposit: FixedDeposit }>> {
    return this.client
      .post<ApiResponse<{ deposit: FixedDeposit }>>(`/banking/deposits/${depositId}/close`, { reason })
      .then(r => r.data);
  }

  // ------------------------------------------------- standing instructions

  async getStandingInstructions(): Promise<ApiResponse<{ instructions: StandingInstruction[] }>> {
    return this.client
      .get<ApiResponse<{ instructions: StandingInstruction[] }>>('/banking/standing-instructions')
      .then(r => r.data);
  }

  async createStandingInstruction(data: {
    sourceAccountId: string;
    beneficiaryId: string;
    amount: number;
    frequency: 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
    dayOfMonth: number;
    startDate: string;
    nickname?: string;
  }): Promise<ApiResponse<{ instruction: StandingInstruction }>> {
    return this.client
      .post<ApiResponse<{ instruction: StandingInstruction }>>('/banking/standing-instructions', data)
      .then(r => r.data);
  }

  async updateStandingInstruction(
    instructionId: string,
    data: { amount?: number; nickname?: string; dayOfMonth?: number; status?: string }
  ): Promise<ApiResponse<{ instruction: StandingInstruction }>> {
    return this.client
      .patch<ApiResponse<{ instruction: StandingInstruction }>>(
        `/banking/standing-instructions/${instructionId}`,
        data
      )
      .then(r => r.data);
  }

  async pauseStandingInstruction(
    instructionId: string,
    reason?: string
  ): Promise<ApiResponse<{ instruction: StandingInstruction }>> {
    return this.client
      .post<ApiResponse<{ instruction: StandingInstruction }>>(
        `/banking/standing-instructions/${instructionId}/pause`,
        { reason }
      )
      .then(r => r.data);
  }

  async resumeStandingInstruction(
    instructionId: string
  ): Promise<ApiResponse<{ instruction: StandingInstruction }>> {
    return this.client
      .post<ApiResponse<{ instruction: StandingInstruction }>>(
        `/banking/standing-instructions/${instructionId}/resume`
      )
      .then(r => r.data);
  }

  async runStandingInstructionNow(
    instructionId: string
  ): Promise<ApiResponse<{ instruction: StandingInstruction; transaction?: any }>> {
    return this.client
      .post<ApiResponse<{ instruction: StandingInstruction; transaction?: any }>>(
        `/banking/standing-instructions/${instructionId}/run`
      )
      .then(r => r.data);
  }

  async cancelStandingInstruction(
    instructionId: string,
    reason?: string
  ): Promise<ApiResponse<{ instruction: StandingInstruction }>> {
    return this.client
      .delete<ApiResponse<{ instruction: StandingInstruction }>>(
        `/banking/standing-instructions/${instructionId}`,
        { data: { reason } }
      )
      .then(r => r.data);
  }

  // ------------------------------------------------------------- nominees

  async getNominees(): Promise<ApiResponse<{ nominees: Nominee[] }>> {
    return this.client.get<ApiResponse<{ nominees: Nominee[] }>>('/banking/nominees').then(r => r.data);
  }

  async registerNominees(data: {
    accountId: string;
    nominees: Array<{
      name: string;
      relationship: string;
      sharePercentage: number;
      dateOfBirth?: string;
      address?: string;
      mobile?: string;
      email?: string;
      identityProof?: string;
    }>;
  }): Promise<ApiResponse<{ nominees: Nominee[] }>> {
    return this.client.post<ApiResponse<{ nominees: Nominee[] }>>('/banking/nominees', data).then(r => r.data);
  }

  async cancelNominees(
    accountId: string,
    reason: string
  ): Promise<ApiResponse<{ nominees: Nominee[] }>> {
    return this.client
      .delete<ApiResponse<{ nominees: Nominee[] }>>('/banking/nominees', { data: { accountId, reason } })
      .then(r => r.data);
  }

  // ------------------------------------------------------------------ KYC

  /**
   * The caller's own KYC record.
   *
   * `latest` is the live submission and `history` is everything before it, kept
   * separate so the status page does not have to guess which is current.
   */
  async getMyKyc(): Promise<
    ApiResponse<{
      latest?: KycSubmission;
      history: KycSubmission[];
      kycStatus?: string;
    }>
  > {
    return this.client
      .get<
        ApiResponse<{ latest?: KycSubmission; history: KycSubmission[]; kycStatus?: string }>
      >('/banking/kyc')
      .then(r => r.data);
  }

  async submitKyc(data: {
    declared: {
      fullName: string;
      dateOfBirth: string;
      address: string;
      occupation: string;
      annualIncome: number;
      sourceOfFunds: string;
      politicallyExposed?: boolean;
    };
    documents: Array<{ type: string; number?: string }>;
    addressProofType?: string;
  }): Promise<ApiResponse<{ submission: KycSubmission }>> {
    return this.client
      .post<ApiResponse<{ submission: KycSubmission }>>('/banking/kyc', data)
      .then(r => r.data);
  }

  /**
   * The branch book — codes and account/staff counts per branch.
   *
   * `branch:read:any`, so every staff role can read it. Deliberately aggregate
   * only: no customer, no account number, and for branch-level staff no
   * per-branch balance total either. That is what lets a directory be readable
   * by everyone without becoming a way to see another branch's business.
   */
  async getBranches(): Promise<ApiResponse<{ branches: any[]; customers: number; scopedToBranch: string | null }>> {
    return this.client
      .get<ApiResponse<{ branches: any[]; customers: number; scopedToBranch: string | null }>>('/admin/branches')
      .then(r => r.data);
  }

  /**
   * The staff directory. `user:manage`, so admin only — the 403 for other roles
   * is the correct answer rather than an empty list to hide behind.
   */
  async getStaff(): Promise<ApiResponse<{ users: any[]; total: number; scopedToBranch: string | null }>> {
    return this.client
      .get<ApiResponse<{ users: any[]; total: number; scopedToBranch: string | null }>>('/admin/users')
      .then(r => r.data);
  }

  /** Change a staff member's role, branch or active state. Revokes their sessions. */
  async updateStaff(
    userId: string,
    data: { role?: string; branchCode?: string; isActive?: boolean }
  ): Promise<ApiResponse<any>> {
    return this.client.patch<ApiResponse<any>>(`/admin/users/${userId}`, data).then(r => r.data);
  }

  async getKycQueue(
    status?: string
  ): Promise<ApiResponse<{ submissions: KycSubmission[]; counts: Record<string, number> }>> {
    return this.client
      .get<ApiResponse<{ submissions: KycSubmission[]; counts: Record<string, number> }>>(
        '/banking/kyc/queue',
        { params: status ? { status } : undefined }
      )
      .then(r => r.data);
  }

  async reviewKyc(
    kycId: string,
    data: {
      decision: 'APPROVE' | 'REJECT';
      notes?: string;
      rejectionReasons?: string[];
      riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
    }
  ): Promise<ApiResponse<{ submission: KycSubmission }>> {
    return this.client
      .post<ApiResponse<{ submission: KycSubmission }>>(`/banking/kyc/${kycId}/review`, data)
      .then(r => r.data);
  }
}

export const api = new ApiService();
export default api;