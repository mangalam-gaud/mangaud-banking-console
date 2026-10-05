import { useState, useEffect, useMemo } from 'react';
import { 
  Download, 
  Filter, 
  Search, 
  ChevronLeft, 
  ChevronRight,
  ArrowDownLeft,
  ArrowUpRight,
  Minus,
  Plus,
  ArrowRightLeft
} from 'lucide-react';
import { formatCurrency, formatDate, formatTime, maskAccountNumber, getTransactionTypeColor } from '../utils/format';

/** True when a timestamp falls on the current calendar day. */
const isToday = (value: string | Date): boolean => {
  const date = new Date(value);
  const now = new Date();
  return (
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
  );
};
import { Button, Input, Select, Card, CardHeader, CardTitle, CardContent, Badge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Modal } from '../components/ui';
import { useAccountStore } from '../store/accountStore';
import { cn } from '../utils/cn';
import { Transaction } from '../types';

const transactionTypeIcons: Record<string, any> = {
  DEPOSIT: ArrowDownLeft,
  OPENING_DEPOSIT: Plus,
  WITHDRAWAL: ArrowUpRight,
  TRANSFER_IN: ArrowDownLeft,
  TRANSFER_OUT: ArrowUpRight,
  TRANSFER: ArrowRightLeft,
  LOAN_DISBURSEMENT: Plus,
  LOAN_REPAYMENT: Minus,
  INTEREST: Plus,
  BALANCE_ADJUSTMENT: Minus,
};

export function Transactions() {
  const { accounts, transactions, fetchTransactions, fetchAccounts, isLoading } = useAccountStore();
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  useEffect(() => {
    const params = {
      page,
      limit,
      type: typeFilter || undefined,
      fromDate: dateFrom || undefined,
      toDate: dateTo || undefined,
    };
    fetchTransactions(params).then((result: any) => {
      // Handle the result
    });
  }, [page, typeFilter, dateFrom, dateTo, fetchTransactions]);

  const handleSearch = () => {
    setPage(1);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
    }
  };

  const getTypeColor = (type: string) => {
    return getTransactionTypeColor(type);
  };

  const getTypeIcon = (type: string) => {
    const Icon = transactionTypeIcons[type];
    return Icon ? <Icon className="w-4 h-4" /> : <Minus className="w-4 h-4" />;
  };

  /*
   * Columns are decided by the data on the page, not fixed up front.
   *
   * A ledger page is read by scanning one column at a time, and a column that
   * reads "—" down its whole height, or repeats the same word twenty times,
   * costs the reader a saccade and gives nothing back. Both columns stay
   * available — they appear the moment a row needs them, so a page containing
   * a failed payment still shows Status.
   */
  const showRelatedAccount = useMemo(
    () => transactions.some((t) => !!t.relatedAccount?.accountNumber),
    [transactions]
  );
  const showStatus = useMemo(
    () => transactions.some((t) => t.status !== 'COMPLETED'),
    [transactions]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Transactions</h1>
          <p className="text-muted mt-1">View and manage all your account transactions</p>
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
                placeholder="Search transactions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-10"
              />
            </div>
            <Select
              placeholder="All Types"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              options={[
                { value: '', label: 'All Types' },
                { value: 'DEPOSIT', label: 'Deposit' },
                { value: 'WITHDRAWAL', label: 'Withdrawal' },
                { value: 'TRANSFER_IN', label: 'Transfer In' },
                { value: 'TRANSFER_OUT', label: 'Transfer Out' },
                { value: 'LOAN_DISBURSEMENT', label: 'Loan Disbursement' },
                { value: 'LOAN_REPAYMENT', label: 'Loan Repayment' },
                { value: 'INTEREST', label: 'Interest' },
              ]}
            />
            <Input
              label="From Date"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
            <Input
              label="To Date"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
            <div className="flex items-end">
              <Button onClick={handleSearch} className="w-full" leftIcon={<Filter className="w-4 h-4" />}>
                Apply Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {transactions.length === 0 && !isLoading ? (
            <div className="text-center py-12">
              <Download className="w-12 h-12 text-muted mx-auto mb-4" />
              <h3 className="text-lg font-medium text-text mb-1">No transactions found</h3>
              <p className="text-muted">Try adjusting your filters or search criteria</p>
            </div>
          ) : (
            <>
              {/*
                The ledger, two ways.

                An eight-column table inside `overflow-x-auto` is technically
                responsive and practically useless: on a 390px phone it showed
                the date and the type and pushed the *amount* — the one column
                anyone opens a bank statement for — off the right edge, behind a
                horizontal swipe that nothing hints at.

                So below `md` the same rows render as a stacked list with the
                amount on the right, which is the form that actually fits. From
                `md` up the table is the better presentation and takes over.
                Both read from the same `transactions` array, so the two can
                never disagree.
              */}
              <ul className="md:hidden divide-y divide-border/70">
                {transactions.map((txn) => {
                  const credit = !['TRANSFER_OUT', 'WITHDRAWAL', 'LOAN_REPAYMENT'].includes(
                    txn.transactionType
                  );
                  return (
                    <li key={txn.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedTxn(txn)}
                        className="w-full text-left px-4 py-3.5 flex items-center gap-3 hover:bg-paper/60 transition-colors"
                      >
                        <span
                          className={cn(
                            'grid place-items-center h-9 w-9 shrink-0 rounded-lg border',
                            credit
                              ? 'bg-success-50 border-success-100 text-success-600'
                              : 'bg-brass-50 border-brass-100 text-brass-700'
                          )}
                        >
                          {getTypeIcon(txn.transactionType)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-text truncate">
                            {txn.description ||
                              txn.transactionType.replace('_', ' ').toLowerCase()}
                          </span>
                          <span className="block text-[0.6875rem] text-muted mt-0.5 truncate">
                            {isToday(txn.createdAt)
                              ? `Today, ${formatTime(txn.createdAt)}`
                              : formatDate(txn.createdAt)}
                            {txn.account?.accountNumber
                              ? ` · ${maskAccountNumber(txn.account.accountNumber)}`
                              : ''}
                            {showStatus && txn.status !== 'COMPLETED' ? ` · ${txn.status}` : ''}
                          </span>
                        </span>
                        <span
                          className={cn(
                            'font-mono text-sm font-semibold shrink-0 tnum',
                            credit ? 'text-success-700' : 'text-ink-soft'
                          )}
                        >
                          {credit ? '+' : '−'}
                          {formatCurrency(txn.amount)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Account</TableHead>
                      {/* Dropped unless something in the page actually has
                          one. It was an entire column of "—" on most screens,
                          which is noise pretending to be information. */}
                      {showRelatedAccount ? <TableHead>Related Account</TableHead> : null}
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Balance After</TableHead>
                      {/* Same reasoning: a column of twenty identical
                          COMPLETED badges tells the reader nothing. */}
                      {showStatus ? <TableHead>Status</TableHead> : null}
                      <TableHead>Reference</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((txn) => (
                      <TableRow key={txn.id} onClick={() => setSelectedTxn(txn)} className="cursor-pointer">
                        <TableCell>
                          {/*
                            Absolute date, plus the time only for today's rows.
                            Showing both the full timestamp and "53m ago" on
                            every row was duplicating the same fact twice, and on
                            a statement the relative form is the wrong one — a
                            bank shows you the date, not how long ago you were.
                          */}
                          {isToday(txn.createdAt) ? (
                            <>
                              <p className="font-medium text-text">Today</p>
                              <p className="text-xs text-muted tnum">
                                {formatTime(txn.createdAt)}
                              </p>
                            </>
                          ) : (
                            <p className="font-medium text-text">
                              {formatDate(txn.createdAt)}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="default" className={getTypeColor(txn.transactionType)}>
                            <span className="flex items-center gap-1">
                              {getTypeIcon(txn.transactionType)}
                              {txn.transactionType.replace('_', ' ')}
                            </span>
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {txn.account?.accountNumber ? (
                            <span className="font-mono text-sm tnum">
                              {maskAccountNumber(txn.account.accountNumber)}
                            </span>
                          ) : (
                            <span className="text-muted">N/A</span>
                          )}
                        </TableCell>
                        {showRelatedAccount ? (
                          <TableCell>
                            {txn.relatedAccount?.accountNumber ? (
                              <span className="font-mono text-sm tnum">
                                {maskAccountNumber(txn.relatedAccount.accountNumber)}
                              </span>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </TableCell>
                        ) : null}
                        <TableCell className="text-right font-medium tnum">
                          {['TRANSFER_OUT', 'WITHDRAWAL', 'LOAN_REPAYMENT'].includes(txn.transactionType) ? '−' : '+'}
                          {formatCurrency(txn.amount)}
                        </TableCell>
                        <TableCell className="tnum">{formatCurrency(txn.balanceAfter)}</TableCell>
                        {showStatus ? (
                          <TableCell>
                            <Badge variant={
                              txn.status === 'COMPLETED' ? 'success' :
                              txn.status === 'PENDING' ? 'warning' :
                              txn.status === 'FAILED' ? 'danger' : 'gray'
                            }>
                              {txn.status}
                            </Badge>
                          </TableCell>
                        ) : null}
                        <TableCell>
                          <code className="text-xs bg-sunken px-2 py-1 rounded">{txn.reference}</code>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-border">
                  <p className="text-sm text-muted">
                    Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} transactions
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

      {selectedTxn && (
        <Modal
          isOpen={!!selectedTxn}
          onClose={() => setSelectedTxn(null)}
          title="Transaction Details"
          size="md"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted">Transaction ID</p>
                <p className="font-mono text-sm">{selectedTxn.id}</p>
              </div>
              <div>
                <p className="text-sm text-muted">Reference</p>
                <p className="font-mono text-sm">{selectedTxn.reference}</p>
              </div>
              <div>
                <p className="text-sm text-muted">Date & Time</p>
                <p>{formatDate(selectedTxn.createdAt)}, {formatTime(selectedTxn.createdAt)}</p>
              </div>
              <div>
                <p className="text-sm text-muted">Type</p>
                <Badge variant="default" className={getTypeColor(selectedTxn.transactionType)}>
                  {selectedTxn.transactionType.replace('_', ' ')}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-muted">Account</p>
                <p className="font-mono text-sm">{selectedTxn.account?.accountNumber || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-muted">Related Account</p>
                <p className="font-mono text-sm">{selectedTxn.relatedAccount?.accountNumber || '—'}</p>
              </div>
              <div>
                <p className="text-sm text-muted">Amount</p>
                <p className={`font-medium ${['TRANSFER_OUT', 'WITHDRAWAL', 'LOAN_REPAYMENT'].includes(selectedTxn.transactionType) ? 'text-danger-700' : 'text-success-700'}`}>
                  {['TRANSFER_OUT', 'WITHDRAWAL', 'LOAN_REPAYMENT'].includes(selectedTxn.transactionType) ? '-' : '+'}{
                    formatCurrency(selectedTxn.amount)
                  }
                </p>
              </div>
              <div>
                <p className="text-sm text-muted">Balance After</p>
                <p className="font-medium text-text">{formatCurrency(selectedTxn.balanceAfter)}</p>
              </div>
              <div className="col-span-2">
                <p className="text-sm text-muted">Description</p>
                <p>{selectedTxn.description || '—'}</p>
              </div>
              <div>
                <p className="text-sm text-muted">Status</p>
                <Badge variant={
                  selectedTxn.status === 'COMPLETED' ? 'success' :
                  selectedTxn.status === 'PENDING' ? 'warning' :
                  selectedTxn.status === 'FAILED' ? 'danger' : 'gray'
                }>
                  {selectedTxn.status}
                </Badge>
              </div>
            </div>
          </div>
        </Modal>
        )}
      </div>
    );
}