import { create } from 'zustand';
import { Account, Transaction, Loan } from '../types';
import { api } from '../services/api';

interface AccountState {
  accounts: Account[];
  selectedAccount: Account | null;
  transactions: Transaction[];
  loans: Loan[];
  isLoading: boolean;
  error: string | null;

  fetchAccounts: () => Promise<void>;
  fetchAccount: (accountNumber: string) => Promise<void>;
  setSelectedAccount: (account: Account | null) => void;
  createAccount: (data: { accountType: string; initialDeposit?: number; currency?: string; customerId?: string }) => Promise<void>;
  fetchAllAccounts: (params?: { page?: number; limit?: number; status?: string; accountType?: string }) => Promise<void>;
  allAccounts: Account[];
  deposit: (data: { accountNumber: string; amount: number; description?: string }) => Promise<void>;
  withdraw: (data: { accountNumber: string; amount: number; description?: string }) => Promise<void>;
  transfer: (data: { sourceAccountNumber: string; destinationAccountNumber: string; amount: number; description?: string }) => Promise<void>;
  fetchTransactionStats: () => Promise<any>;
  fetchTransactions: (params?: any) => Promise<void>;
  fetchMiniStatement: (accountNumber: string, limit?: number) => Promise<void>;
  fetchLoans: () => Promise<void>;
  fetchLoan: (loanId: string) => Promise<{ loan: any; payments: any[] } | void>;
  applyLoan: (data: any) => Promise<void>;
  repayLoan: (loanId: string, amount: number, fromAccountId?: string) => Promise<void>;
  calculateLoanInterest: (loanId: string, fromDate: string, toDate: string) => Promise<number>;
  clearError: () => void;
}

export const useAccountStore = create<AccountState>((set, get) => ({
  accounts: [],
  allAccounts: [],
  selectedAccount: null,
  transactions: [],
  loans: [],
  isLoading: false,
  error: null,

  clearError: () => set({ error: null }),

  createAccount: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.createAccount(data);
      if (response.success && response.data) {
        // Re-fetch so the new account appears with server-assigned fields
        // (account number, opening balance, timestamps).
        await get().fetchAccounts();
        set({ isLoading: false });
      } else {
        throw new Error(response.error || 'Failed to create account');
      }
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  fetchAllAccounts: async (params) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.getAllAccounts(params);
      if (response.success && response.data) {
        set({ allAccounts: response.data.accounts || [], isLoading: false });
      } else {
        throw new Error(response.error || 'Failed to fetch accounts');
      }
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  deposit: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.deposit(data);
      if (response.success) {
        await get().fetchAccounts();
        set({ isLoading: false });
      } else {
        throw new Error(response.error || 'Deposit failed');
      }
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  withdraw: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.withdraw(data);
      if (response.success) {
        await get().fetchAccounts();
        set({ isLoading: false });
      } else {
        throw new Error(response.error || 'Withdrawal failed');
      }
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  transfer: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.transfer(data);
      if (response.success) {
        await get().fetchAccounts();
        set({ isLoading: false });
      } else {
        throw new Error(response.error || 'Transfer failed');
      }
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  fetchTransactionStats: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.getTransactionStats();
      if (response.success) {
        set({ isLoading: false });
        return response.data;
      }
      set({ isLoading: false });
      return null;
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      return null;
    }
  },

  fetchAccounts: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.getMyAccounts();
      if (response.success && response.data) {
        set({ accounts: response.data.accounts, isLoading: false });
      } else {
        throw new Error(response.error || 'Failed to fetch accounts');
      }
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  fetchAccount: async (accountNumber: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.getAccount(accountNumber);
      if (response.success && response.data) {
        set({ selectedAccount: response.data.account, isLoading: false });
      } else {
        throw new Error(response.error || 'Failed to fetch account');
      }
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  setSelectedAccount: (account) => set({ selectedAccount: account }),

  fetchTransactions: async (params) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.getTransactions(params);
      if (response.success && response.data) {
        set({ transactions: response.data.transactions, isLoading: false });
      } else {
        throw new Error(response.error || 'Failed to fetch transactions');
      }
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  fetchMiniStatement: async (accountNumber: string, limit = 10) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.getMiniStatement(accountNumber, limit);
      if (response.success && response.data) {
        set({ transactions: response.data.transactions, isLoading: false });
      } else {
        throw new Error(response.error || 'Failed to fetch statement');
      }
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  fetchLoans: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.getMyLoans();
      if (response.success && response.data) {
        set({ loans: response.data.loans, isLoading: false });
      } else {
        throw new Error(response.error || 'Failed to fetch loans');
      }
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  fetchLoan: async (loanId: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.getLoan(loanId);
      if (response.success && response.data) {
        set({ isLoading: false });
        return response.data;
      } else {
        throw new Error(response.error || 'Failed to fetch loan');
      }
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  applyLoan: async (data: any) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.applyLoan(data);
      if (response.success && response.data) {
        set({ isLoading: false });
        return;
      } else {
        throw new Error(response.error || 'Failed to apply for loan');
      }
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  repayLoan: async (loanId: string, amount: number, fromAccountId?: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.repayLoan({ loanId, amount, fromAccountId });
      if (response.success && response.data) {
        set({ isLoading: false });
        return;
      } else {
        throw new Error(response.error || 'Failed to repay loan');
      }
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  calculateLoanInterest: async (loanId: string, fromDate: string, toDate: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.calculateLoanInterest({ loanId, fromDate, toDate });
      if (response.success && response.data) {
        set({ isLoading: false });
        return response.data.interest;
      } else {
        throw new Error(response.error || 'Failed to calculate interest');
      }
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },
}));