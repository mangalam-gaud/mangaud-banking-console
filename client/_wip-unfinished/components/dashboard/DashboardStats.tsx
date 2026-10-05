import { useState, useEffect } from 'react';
import { 
  CreditCard, 
  Eye, 
  FileText, 
  ArrowUpRight,
  TrendingUp,
  DollarSign,
  ArrowRight
} from 'lucide-react';
import { formatCurrency } from '../../utils/format';
import { Card, CardContent, Badge, Button, Skeleton, SkeletonStatCard } from '../ui';
import { useAccountStore } from '../../store/accountStore';
import { useDebounce } from '../../hooks';
import { Transaction } from '../../types';

interface DashboardStatsProps {
  className?: string;
}

export function DashboardStats({ className }: DashboardStatsProps) {
  const { accounts, transactions, loans, fetchAccounts, fetchTransactions, fetchLoans, isLoading } = useAccountStore();
  const [displayedAccounts, setDisplayedAccounts] = useState(accounts);
  const [displayedTransactions, setDisplayedTransactions] = useState(transactions);
  const [displayedLoans, setDisplayedLoans] = useState(loans);
  
  // Debounced search for accounts
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);

  useEffect(() => {
    if (debouncedSearch) {
      const filtered = accounts.filter(acc => 
        acc.accountNumber.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        acc.accountType.toLowerCase().includes(debouncedSearch.toLowerCase())
      );
      setDisplayedAccounts(filtered);
    } else {
      setDisplayedAccounts(accounts);
    }
  }, [debouncedSearch, accounts]);

  const totalBalance = accounts.reduce((sum: number, acc: { balance: number }) => sum + acc.balance, 0);
  const activeAccounts = accounts.filter((a: { status: string }) => a.status === 'ACTIVE').length;
  const activeLoans = loans.filter((l: { status: string }) => l.status === 'DISBURSED').length;
  const totalOutstanding = loans.reduce((sum: number, loan: { outstandingAmount: number }) => sum + loan.outstandingAmount, 0);
  const recentTransactions = transactions.slice(0, 5);

  // Show skeleton loaders while loading
  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard data">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Skeleton variant="text" width="30%" />
            <Skeleton variant="text" width="50%" />
          </div>
          <Skeleton variant="rectangular" width={100} height={40} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <SkeletonStatCard key={i} />)}
        </div>
        <div className="space-y-6">
          <div className="lg:col-span-2">
            <SkeletonCard />
          </div>
          <div className="space-y-6">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text">Dashboard</h1>
          <p className="text-muted mt-1">Overview of your banking activity</p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search accounts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input w-64"
            aria-label="Search accounts"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="hover:shadow-card-hover transition-shadow duration-200">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted">Total Balance</p>
              <p className="text-2xl font-bold text-text">{formatCurrency(totalBalance)}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-card-hover transition-shadow duration-200">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted">Active Accounts</p>
              <p className="text-2xl font-bold text-text">{activeAccounts}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <Eye className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-card-hover transition-shadow duration-200">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted">Active Loans</p>
              <p className="text-2xl font-bold text-text">{activeLoans}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
              <FileText className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-card-hover transition-shadow duration-200">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted">Total Outstanding</p>
              <p className="text-2xl font-bold text-text">{formatCurrency(totalOutstanding)}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <ArrowUpRight className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-text">Your Accounts</h2>
                <p className="text-sm text-muted">Manage and view all your accounts</p>
              </div>
              <Button size="sm" leftIcon={<ArrowRight className="w-4 h-4" />}>
                View All
              </Button>
            </div>
            
            {displayedAccounts.length === 0 ? (
              <div className="text-center py-12">
                <CreditCard className="w-12 h-12 text-muted mx-auto mb-4" />
                <h3 className="text-lg font-medium text-text mb-1">No accounts found</h3>
                <p className="text-muted mb-4">Create your first account to get started</p>
                <Button leftIcon={<ArrowRight className="w-4 h-4" />}>
                  Open Account
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {displayedAccounts.map((account: any) => (
                  <div
                    key={account.id}
                    className="card-hover flex items-center gap-4 p-4 group transition-all duration-200"
                    onClick={() => window.location.href = `/accounts/${account.accountNumber}`}
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      account.accountType === 'SAVINGS' ? 'bg-blue-100 text-blue-600' :
                      account.accountType === 'CURRENT' ? 'bg-green-100 text-green-600' :
                      'bg-purple-100 text-purple-600'
                    }`}>
                      {account.accountType === 'SAVINGS' && <CreditCard className="w-6 h-6" />}
                      {account.accountType === 'CURRENT' && <TrendingUp className="w-6 h-6" />}
                      {account.accountType === 'SALARY' && <DollarSign className="w-6 h-6" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-text truncate">{account.accountType} Account</p>
                        <Badge variant={account.status === 'ACTIVE' ? 'success' : 'gray'}>
                          {account.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted truncate">{account.accountNumber}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-text">{formatCurrency(account.balance, account.currency)}</p>
                      <p className="text-xs text-muted">{account.interestRate}% interest</p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-muted group-hover:text-text transition-colors" />
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-text">Recent Transactions</h2>
                <p className="text-sm text-muted">Your latest account activity</p>
              </div>
              <Button variant="ghost" size="sm">View All</Button>
            </div>
            
            {recentTransactions.length === 0 ? (
              <div className="text-center py-8">
                <CreditCard className="w-12 h-12 text-muted mx-auto mb-4" />
                <p className="text-muted">No transactions yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentTransactions.map((txn: Transaction) => (
                  <div
                    key={txn.id}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        txn.transactionType === 'DEPOSIT' || txn.transactionType === 'OPENING_DEPOSIT' ? 'bg-green-100 text-green-600' :
                        txn.transactionType === 'WITHDRAWAL' ? 'bg-red-100 text-red-600' :
                        txn.transactionType.includes('TRANSFER') ? 'bg-blue-100 text-blue-600' :
                        txn.transactionType === 'LOAN_DISBURSEMENT' ? 'bg-purple-100 text-purple-600' :
                        txn.transactionType === 'LOAN_REPAYMENT' ? 'bg-orange-100 text-orange-600' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {txn.transactionType === 'DEPOSIT' || txn.transactionType === 'OPENING_DEPOSIT' ? (
                          <ArrowUpRight className="w-4 h-4" />
                        ) : txn.transactionType === 'WITHDRAWAL' ? (
                          <ArrowUpRight className="w-4 h-4 rotate-180" />
                        ) : (
                          <ArrowRight className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-text text-sm">
                          {txn.transactionType.replace('_', ' ')}
                        </p>
                        <p className="text-xs text-muted">
                          {txn.description || 'No description'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-medium text-sm ${
                        ['TRANSFER_OUT', 'WITHDRAWAL', 'LOAN_REPAYMENT'].includes(txn.transactionType) 
                          ? 'text-red-600' : 'text-green-600'
                      }`}>
                        {['TRANSFER_OUT', 'WITHDRAWAL', 'LOAN_REPAYMENT'].includes(txn.transactionType) ? '-' : '+'}
                        {formatCurrency(txn.amount)}
                      </p>
                      <p className="text-xs text-muted">
                        Balance: {formatCurrency(txn.balanceAfter)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-text">Quick Actions</h2>
                <p className="text-sm text-muted">Common banking operations</p>
              </div>
            </div>
            <div className="space-y-3">
              <button className="card-hover flex items-center gap-4 p-4 group w-full text-left">
                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <ArrowUpRight className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-text">Deposit Money</p>
                  <p className="text-sm text-muted">Add funds to your account</p>
                </div>
                <ArrowRight className="w-5 h-5 text-muted group-hover:text-text transition-colors" />
              </button>
              <button className="card-hover flex items-center gap-4 p-4 group w-full text-left">
                <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <ArrowUpRight className="w-5 h-5 text-red-600 dark:text-red-400 rotate-180" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-text">Withdraw Money</p>
                  <p className="text-sm text-muted">Take out cash from your account</p>
                </div>
                <ArrowRight className="w-5 h-5 text-muted group-hover:text-text transition-colors" />
              </button>
              <button className="card-hover flex items-center gap-4 p-4 group w-full text-left">
                <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <ArrowRight className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-text">Transfer Funds</p>
                  <p className="text-sm text-muted">Send money to another account</p>
                </div>
                <ArrowRight className="w-5 h-5 text-muted group-hover:text-text transition-colors" />
              </button>
              <button className="card-hover flex items-center gap-4 p-4 group w-full text-left">
                <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-text">Apply for Loan</p>
                  <p className="text-sm text-muted">Get a personal or business loan</p>
                </div>
                <ArrowRight className="w-5 h-5 text-muted group-hover:text-text transition-colors" />
              </button>
            </div>
          </Card>

          {loans.length > 0 && (
            <Card>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-text">Loan Overview</h2>
                  <p className="text-sm text-muted">Track your loan repayments</p>
                </div>
              </div>
              <div className="space-y-3">
                {loans.slice(0, 3).map((loan: any) => (
                  <div key={loan.id} className="card p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-text">Loan #{loan.id.slice(-8)}</p>
                      <Badge variant={loan.status === 'DISBURSED' ? 'success' : 'warning'}>
                        {loan.status}
                      </Badge>
                    </div>
                    <div className="h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-600 transition-all duration-500"
                        style={{ width: `${loan.progressPercentage || 0}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-sm text-muted">
                      <span>Paid: {formatCurrency(loan.totalPaid || 0)}</span>
                      <span>Outstanding: {formatCurrency(loan.outstandingAmount)}</span>
                    </div>
                    {loan.nextDueDate && (
                      <p className="text-xs text-muted">
                        Next payment due: {new Date(loan.nextDueDate).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                ))}
                {loans.length > 3 && (
                  <button className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                    View all {loans.length} loans →
                  </button>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}