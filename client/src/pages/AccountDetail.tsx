import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  CreditCard,
  Wallet,
  Snowflake,
  RefreshCw,
  ArrowDownLeft,
  ArrowUpRight,
  Percent,
} from 'lucide-react';
import { api } from '../services/api';
import { usePermissions } from '../store/permissionStore';
import { formatCurrency, formatDate, getTransactionTypeColor } from '../utils/format';
import {
  PageHeader,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  StatusBadge,
  Skeleton,
  EmptyState,
} from '../components/ui';
import type { Transaction } from '../types';

/**
 * One account, with its recent ledger.
 *
 * This route previously rendered `OpenAccount`, so clicking an account on the
 * dashboard landed the customer on a form asking them to open a *new* account.
 * There was no account detail screen anywhere in the app, and the misleading
 * route is what hid that.
 *
 * Reachable by customers and by staff holding `account:read:any`, which is why
 * it sits outside `CustomerRoute`: a teller looking up a customer's balance gets
 * a working screen rather than a redirect.
 */

const typeIcons: Record<string, typeof Wallet> = {
  DEPOSIT: ArrowDownLeft,
  OPENING_DEPOSIT: ArrowDownLeft,
  LOAN_DISBURSEMENT: ArrowDownLeft,
  TRANSFER_IN: ArrowDownLeft,
  INTEREST: Percent,
  WITHDRAWAL: ArrowUpRight,
  TRANSFER_OUT: ArrowUpRight,
  LOAN_REPAYMENT: ArrowUpRight,
};

const CREDIT_TYPES = new Set([
  'DEPOSIT',
  'OPENING_DEPOSIT',
  'LOAN_DISBURSEMENT',
  'TRANSFER_IN',
  'INTEREST',
]);

const accountTypeIcon = (type: string) => {
  switch (type) {
    case 'SAVINGS':
      return Snowflake;
    case 'CURRENT':
      return Building2;
    case 'SALARY':
      return CreditCard;
    default:
      return Wallet;
  }
};

export function AccountDetail() {
  const { accountNumber } = useParams<{ accountNumber: string }>();
  const navigate = useNavigate();
  const { can } = usePermissions();

  const [account, setAccount] = useState<any>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!accountNumber) return;
    setIsLoading(true);
    setError(null);
    try {
      const [accountRes, ledgerRes] = await Promise.all([
        api.getAccount(accountNumber),
        api.getMiniStatement(accountNumber, 12),
      ]);

      if (!accountRes.success || !accountRes.data?.account) {
        throw new Error(accountRes.error || 'Account not found');
      }
      setAccount(accountRes.data.account);

      const rows = ledgerRes.success && ledgerRes.data?.transactions
        ? ledgerRes.data.transactions
        : [];
      setTransactions(rows);
    } catch (err) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(message || (err as Error).message || 'Could not load this account');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // Re-fetch whenever the route param changes, so navigating between two
    // accounts does not leave the previous one's balance on screen.
  }, [accountNumber]);

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton variant="text" width="12rem" height="1.75rem" />
        <Skeleton variant="card" />
        <Skeleton variant="card" />
      </div>
    );
  }

  if (error || !account) {
    return (
      <Card>
        <EmptyState
          icon={<Wallet className="h-6 w-6" />}
          title="Account unavailable"
          description={error ?? 'This account could not be loaded.'}
          action={
            <Button onClick={() => navigate('/accounts')}>
              <ArrowLeft className="h-4 w-4" />
              Back to accounts
            </Button>
          }
        />
      </Card>
    );
  }

  const TypeIcon = accountTypeIcon(account.accountType);
  const holder = account.customer
    ? `${account.customer.firstName} ${account.customer.lastName}`.trim()
    : null;

  return (
    <div className="space-y-5">
      <div>
        <Link
          to="/accounts"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text transition-colors"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          All accounts
        </Link>
      </div>

      <PageHeader
        eyebrow={account.accountType}
        title={account.accountNumber}
        description={holder ? `Held by ${holder}` : undefined}
        actions={
          <Button variant="secondary" onClick={() => void load()} aria-label="Refresh account">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TypeIcon className="h-5 w-5 text-brass-600" aria-hidden="true" />
              Balance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="amount text-3xl font-bold">
              {formatCurrency(account.balance)}
            </p>

            <dl className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted">Status</dt>
                <dd>
                  <StatusBadge status={account.status} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted">Type</dt>
                <dd className="font-medium text-text">{account.accountType}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted">Interest rate</dt>
                <dd className="font-medium text-text tnum">
                  {Number(account.interestRate ?? 0).toFixed(2)}% p.a.
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted">Currency</dt>
                <dd className="font-medium text-text">{account.currency ?? 'INR'}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted">Opened</dt>
                <dd className="font-medium text-text">
                  {formatDate(account.openedAt)}
                </dd>
              </div>
              {account.customer?.email && (
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted">Email</dt>
                  <dd className="truncate font-medium text-text">{account.customer.email}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            {transactions.length === 0 ? (
              <EmptyState
                title="No transactions yet"
                description="Activity on this account will appear here."
              />
            ) : (
              <ul className="divide-y divide-border">
                {transactions.map((txn) => {
                  const Icon = typeIcons[txn.transactionType] ?? Wallet;
                  const isCredit = CREDIT_TYPES.has(txn.transactionType);
                  return (
                    <li
                      key={txn.id ?? txn.reference}
                      className="flex items-center gap-3 py-3"
                    >
                      <span
                        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
                          isCredit ? 'bg-success-50 text-success-600' : 'bg-paper text-muted'
                        }`}
                        aria-hidden="true"
                      >
                        <Icon className="h-4 w-4" />
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-text">
                          {txn.description ||
                            txn.transactionType.replace(/_/g, ' ').toLowerCase()}
                        </p>
                        <p className="text-xs text-muted">
                          {formatDate(txn.createdAt)} &middot;{' '}
                          <span className={getTransactionTypeColor(txn.transactionType)}>
                            {txn.transactionType.replace(/_/g, ' ')}
                          </span>
                        </p>
                      </div>

                      <p
                        className={`amount shrink-0 text-sm font-semibold ${
                          isCredit ? 'text-success-700' : 'text-text'
                        }`}
                      >
                        {isCredit ? '+' : '-'}
                        {formatCurrency(txn.amount)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-border pt-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate(`/transactions?accountId=${account.id}`)}
              >
                Full ledger
              </Button>
              {!can('account:deposit') && (
                <Badge variant="outline">Read only</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default AccountDetail;