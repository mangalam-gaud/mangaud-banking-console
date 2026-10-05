import { useState, useEffect } from 'react';
import { 
  Search, 
  Filter, 
  Download, 
  ChevronLeft, 
  ChevronRight,
  Building2,
  CreditCard,
  DollarSign,
  Eye
} from 'lucide-react';
import { formatCurrency, formatDate, getTransactionTypeColor } from '../utils/format';
import { Button, Input, Select, Card, CardHeader, CardTitle, CardContent, Badge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Modal } from '../components/ui';
import { usePermissions } from '../store/permissionStore';
import { useAccountStore } from '../store/accountStore';
import { Account } from '../types';
import toast from 'react-hot-toast';

const accountTypeIcons = {
  SAVINGS: CreditCard,
  CURRENT: Building2,
  SALARY: DollarSign,
};

const accountTypeColors = {
  SAVINGS: 'bg-primary-50 text-primary-700',
  CURRENT: 'bg-success-50 text-success-700',
  SALARY: 'bg-brass-50 text-brass-700',
};

export function AllAccounts() {
/*
 * Which list to show.
 *
 * This was `role === 'admin' || role === 'manager'`, which left the other three
 * staff roles -- teller, loan officer and auditor -- calling `getMyAccounts()`.
 * They have no `Customer` record, so the API correctly returned an empty list
 * and the page said "No accounts found" while all of them hold
 * `account:read:any` and can read every account through `GET /accounts/all`.
 *
 * The question is "does this caller see the whole bank", which is exactly what
 * `isStaff` answers. Every staff role passes the route guard on
 * `account:read:any`, so every staff role should see the full list.
 */
const { isStaff } = usePermissions();
const {
  accounts: userAccounts,
  allAccounts: bankAccounts,
  fetchAccounts: fetchUserAccounts,
  fetchAllAccounts: fetchBankAccounts,
} = useAccountStore();
const [page, setPage] = useState(1);
const [limit] = useState(20);
const [search, setSearch] = useState('');
const [statusFilter, setStatusFilter] = useState('');
const [typeFilter, setTypeFilter] = useState('');
const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);

const accounts = isStaff ? bankAccounts : userAccounts;

useEffect(() => {
  if (isStaff) {
    fetchBankAccounts({ page: 1, limit: 100 });
  } else {
    fetchUserAccounts();
  }
}, [isStaff, fetchUserAccounts, fetchBankAccounts]);

  const total = accounts.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const isLoading = useAccountStore((s) => s.isLoading);

  const filteredAccounts = accounts.filter((account) => {
    const matchesSearch = !search || 
      account.accountNumber.toLowerCase().includes(search.toLowerCase()) ||
      account.customer?.firstName?.toLowerCase().includes(search.toLowerCase()) ||
      account.customer?.lastName?.toLowerCase().includes(search.toLowerCase()) ||
      account.customer?.email?.toLowerCase().includes(search.toLowerCase());
    
    const matchesStatus = !statusFilter || account.status === statusFilter;
    const matchesType = !typeFilter || account.accountType === typeFilter;
    
    return matchesSearch && matchesStatus && matchesType;
  });

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">All Accounts</h1>
          <p className="text-muted mt-1">View and manage all bank accounts</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" leftIcon={<Download className="w-4 h-4" />}>Export</Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <Input
                placeholder="Search accounts..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-10"
              />
            </div>
            <Select
              placeholder="All Status"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              options={[
                { value: '', label: 'All Status' },
                { value: 'ACTIVE', label: 'Active' },
                { value: 'BLOCKED', label: 'Blocked' },
                { value: 'CLOSED', label: 'Closed' },
              ]}
            />
            <Select
              placeholder="All Types"
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
              options={[
                { value: '', label: 'All Types' },
                { value: 'SAVINGS', label: 'Savings' },
                { value: 'CURRENT', label: 'Current' },
                { value: 'SALARY', label: 'Salary' },
              ]}
            />
            <div className="flex items-end">
              <Button variant="outline" onClick={() => { setSearch(''); setStatusFilter(''); setTypeFilter(''); setPage(1); }} leftIcon={<Filter className="w-4 h-4" />}>
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {filteredAccounts.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="w-12 h-12 text-muted mx-auto mb-4" />
              <h3 className="text-lg font-medium text-text mb-1">No accounts found</h3>
              <p className="text-muted">Try adjusting your filters</p>
            </div>
          ) : (
            <>
              <ul className="md:hidden divide-y divide-border/70">
                {filteredAccounts.map((account) => {
                  const Icon = accountTypeIcons[account.accountType];
                  return (
                    <li key={account.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedAccount(account)}
                        className="w-full text-left px-4 py-3.5 flex items-center gap-3 hover:bg-paper/60 transition-colors"
                      >
                        <span
                          className={`grid place-items-center h-9 w-9 shrink-0 rounded-lg ${accountTypeColors[account.accountType]}`}
                        >
                          <Icon className="w-4 h-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="text-sm font-medium text-text">
                              {account.accountType}
                            </span>
                            <Badge
                              variant={
                                account.status === 'ACTIVE'
                                  ? 'success'
                                  : account.status === 'BLOCKED'
                                    ? 'warning'
                                    : 'gray'
                              }
                            >
                              {account.status}
                            </Badge>
                          </span>
                          <span className="block text-[0.6875rem] text-muted mt-0.5 truncate">
                            <span className="font-mono">{account.accountNumber}</span>
                            {account.customer?.firstName
                              ? ` · ${account.customer.firstName} ${account.customer.lastName ?? ''}`
                              : ''}
                            {account.interestRate ? ` · ${account.interestRate}% p.a.` : ''}
                          </span>
                        </span>
                        <span className="font-mono text-sm font-semibold text-text shrink-0 tnum">
                          {formatCurrency(account.balance, account.currency)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              {/* Same two-way rendering as the customer ledger: eight columns do
                  not fit a 390px screen, and the balance — column four — is
                  exactly what falls off the edge. Stacked below `md`, table
                  from `md` up. */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account Number</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Balance</TableHead>
                      <TableHead>Interest Rate</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Opened</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAccounts.map((account) => {
                      const Icon = accountTypeIcons[account.accountType];
                      return (
                        <TableRow key={account.id}>
                          <TableCell>
                            <code className="text-sm font-mono">{account.accountNumber}</code>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium text-text">
                                {account.customer?.firstName} {account.customer?.lastName}
                              </p>
                              <p className="text-sm text-muted">{account.customer?.email}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accountTypeColors[account.accountType]}`}>
                                <Icon className="w-4 h-4" />
                              </div>
                              <span className="font-medium">{account.accountType}</span>
                            </div>
                          </TableCell>
                          <TableCell className="font-semibold text-text">
                            {formatCurrency(account.balance, account.currency)}
                          </TableCell>
                          <TableCell>{account.interestRate}%</TableCell>
                          <TableCell>
                            <Badge variant={
                              account.status === 'ACTIVE' ? 'success' :
                              account.status === 'BLOCKED' ? 'warning' : 'gray'
                            }>
                              {account.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatDate(account.openedAt)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => setSelectedAccount(account)}
                                leftIcon={<Eye className="w-4 h-4" />}
                              >
                                View
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-border">
                  <p className="text-sm text-muted">
                    Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} accounts
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handlePageChange(page - 1)}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      let pageNum = i + 1;
                      if (totalPages > 5) {
                        if (page > 3 && page < totalPages - 2) {
                          pageNum = page - 3 + i;
                        } else if (page >= totalPages - 2) {
                          pageNum = totalPages - 5 + i + 1;
                        }
                      }
                      return (
                        <Button
                          key={pageNum}
                          variant={page === pageNum ? 'primary' : 'ghost'}
                          size="sm"
                          onClick={() => handlePageChange(pageNum)}
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handlePageChange(page + 1)}
                      disabled={page === totalPages}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

          {isLoading && (
            <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
            </div>
          )}
        </CardContent>
      </Card>

      {selectedAccount && (
        <Modal
          isOpen={!!selectedAccount}
          onClose={() => setSelectedAccount(null)}
          title="Account Details"
          size="lg"
        >
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 space-y-4">
                <div className="flex items-center gap-4 p-4 rounded-xl bg-sunken">
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${accountTypeColors[selectedAccount.accountType]}`}>
                    {(() => {
                      const Icon = accountTypeIcons[selectedAccount.accountType];
                      return <Icon className="w-7 h-7" />;
                    })()}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-text">{selectedAccount.accountType} Account</h3>
                    <p className="text-muted">{selectedAccount.accountNumber}</p>
                  </div>
                  <Badge variant={
                    selectedAccount.status === 'ACTIVE' ? 'success' :
                    selectedAccount.status === 'BLOCKED' ? 'warning' : 'gray'
                  } className="ml-auto">
                    {selectedAccount.status}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-sunken">
                    <p className="text-sm text-muted">Balance</p>
                    <p className="text-2xl font-bold text-text">{formatCurrency(selectedAccount.balance, selectedAccount.currency)}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-sunken">
                    <p className="text-sm text-muted">Interest Rate</p>
                    <p className="text-2xl font-bold text-text">{selectedAccount.interestRate}%</p>
                  </div>
                  <div className="p-4 rounded-lg bg-sunken">
                    <p className="text-sm text-muted">Currency</p>
                    <p className="text-lg font-semibold text-text">{selectedAccount.currency}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-sunken">
                    <p className="text-sm text-muted">Opened</p>
                    <p className="text-lg font-semibold text-text">{formatDate(selectedAccount.openedAt)}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-sunken">
                  <p className="text-sm text-muted">Customer</p>
                  <p className="font-semibold text-text">
                    {selectedAccount.customer?.firstName} {selectedAccount.customer?.lastName}
                  </p>
                  <p className="text-sm text-muted">{selectedAccount.customer?.email}</p>
                  <p className="text-sm text-muted">{selectedAccount.customer?.phone}</p>
                </div>
                {selectedAccount.closedAt && (
                  <div className="p-4 rounded-lg bg-danger-50 border border-danger-100">
                    <p className="text-sm text-danger-700 font-medium">Account Closed</p>
                    <p className="text-sm text-danger-700">Closed on: {formatDate(selectedAccount.closedAt)}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-border">
              <h4 className="font-medium text-text mb-3">Recent Transactions</h4>
              <p className="text-sm text-muted">Transaction history would be loaded here</p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}