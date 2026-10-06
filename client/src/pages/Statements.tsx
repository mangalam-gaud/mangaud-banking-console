import { useCallback, useEffect, useState } from 'react';
import {
  FileText,
  Download,
  Printer,
  Calendar,
  Wallet,
  ChevronLeft,
  ChevronRight,
  ArrowDown,
  ArrowUp,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { usePermissions } from '../store/permissionStore';
import { Account, Statement as StatementDoc, StatementRow } from '../types';
import { formatCurrency, formatDate, formatDateTime, maskAccountNumber, downloadCSV } from '../utils/format';
import jsPDF from 'jspdf';
import { cn } from '../utils/cn';
import {
  PageHeader,
  Card,
  CardContent,
  Button,
  Badge,
  Input,
  Select,
  Skeleton,
  EmptyState,
} from '../components/ui';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

export function Statements() {
  const { isStaff } = usePermissions();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  const [accountId, setAccountId] = useState('');
  const [fromDate, setFromDate] = useState(iso(daysAgo(90)));
  const [toDate, setToDate] = useState(iso(new Date()));
  const [generating, setGenerating] = useState(false);

  const [statement, setStatement] = useState<StatementDoc | null>(null);
  const [rows, setRows] = useState<StatementRow[]>([]);
  const [history, setHistory] = useState<StatementDoc[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [downloading, setDownloading] = useState(false);

  /*
   * The customer a statement is for, derived from the selected account.
   *
   * Only meaningful for staff: a customer is always resolved from their own
   * session by the server, which ignores this. For staff it selects the holder of
   * whichever account they picked, and is what turns `statement:read:any` from a
   * permission nobody could exercise into a working screen.
   */
  const selectedCustomerId = isStaff
    ? (accounts.find((a) => a.id === accountId)?.customerId as string | undefined)
    : undefined;

  /*
   * Load the account list, from the right place for the caller's role.
   *
   * A customer lists their own accounts. Staff have no Customer record, so
   * `getMyAccounts` returns an empty list for them and the account picker was
   * empty -- the page rendered, because every staff role holds
   * `statement:read:any`, and then had nothing to generate from. Staff list the
   * bank instead and act on behalf of the selected account's holder, which is
   * what `statement:*:any` is for.
   */
  useEffect(() => {
    (async () => {
      try {
        const accountsPromise = isStaff
          ? api.getAllAccounts({ page: 1, limit: 100 }).then((r) => r.data?.accounts ?? [])
          : api.getMyAccounts().then((r) => r.data?.accounts ?? []);

        const [list] = await Promise.all([accountsPromise]);
        setAccounts(list as Account[]);
        setAccountId((prev) => prev || (list[0] as Account)?.id || '');
      } catch (err: any) {
        toast.error(err?.response?.data?.error || 'Could not load accounts');
      } finally {
        setLoading(false);
      }
    })();
  }, [isStaff]);

  /*
   * History is loaded per-customer, and only once we know who that is.
   *
   * For a customer the server resolves their own record from the session and
   * ignores `customerId`, so passing it is harmless. For staff it selects the
   * holder of the selected account, which is what makes the previous statements
   * list real instead of an error.
   */
  useEffect(() => {
    if (!accountId) return;
    (async () => {
      try {
        const res = await api.getStatements({ limit: 20, customerId: selectedCustomerId });
        setHistory(res.data?.statements ?? []);
      } catch {
        setHistory([]);
      }
    })();
  }, [accountId, selectedCustomerId]);

  const generate = useCallback(async () => {
    if (!accountId) return toast.error('Choose an account');
    if (!fromDate || !toDate) return toast.error('Choose a date range');
    if (new Date(toDate) <= new Date(fromDate)) {
      return toast.error('The end date must be after the start date');
    }

    setGenerating(true);
    try {
      const res = await api.generateStatement({
        accountId,
        fromDate,
        toDate,
        customerId: selectedCustomerId,
      });
      setStatement(res.data?.statement ?? null);
      setRows(res.data?.rows ?? []);
      setShowHistory(false);
      toast.success('Statement generated');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Could not generate the statement');
    } finally {
      setGenerating(false);
    }
  }, [accountId, fromDate, toDate, selectedCustomerId]);

  const openStatement = async (id: string) => {
    setGenerating(true);
    try {
      const res = await api.getStatement(id);
      setStatement(res.data?.statement ?? null);
      setRows(res.data?.rows ?? []);
      setShowHistory(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Could not open that statement');
    } finally {
      setGenerating(false);
    }
  };

  const downloadPdf = async () => {
    if (!statement && rows.length === 0) return;
    setDownloading(true);
    try {
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text(`Account statement`, 14, 18);
      doc.setFontSize(10);
      const titleAccount = statement?.accountNumber ?? '';
      const titleNumber = statement?.statementNumber ?? '';
      doc.text(`Account: ${titleAccount}`, 14, 26);
      doc.text(`Statement: ${titleNumber}`, 14, 32);
      let y = 42;
      doc.setFontSize(8);
      doc.text('Date', 14, y);
      doc.text('Description', 40, y);
      doc.text('Type', 110, y);
      doc.text('Debit', 130, y);
      doc.text('Credit', 152, y);
      doc.text('Balance', 175, y);
      y += 6;
      const rowsToWrite = rows.length > 0 ? rows : (statement ? [{ date: statement.fromDate, reference: titleNumber, description: 'Statement available', type: 'SUMMARY', debit: undefined, credit: undefined, balance: statement.closingBalance } as unknown as StatementRow] : []);
      for (const r of rowsToWrite.slice(0, 38)) {
        doc.text(formatDate(r.date), 14, y);
        doc.text((r.description ?? '').slice(0, 28), 40, y);
        doc.text(String(r.type ?? ''), 110, y);
        doc.text(r.debit != null ? String(r.debit) : '', 130, y);
        doc.text(r.credit != null ? String(r.credit) : '', 152, y);
        doc.text(r.balance != null ? String(r.balance) : '', 175, y);
        y += 6;
        if (y > 285) break;
      }
      doc.save(`${titleAccount}-${titleNumber}.pdf`);
      toast.success('PDF downloaded');
    } catch {
      toast.error('Could not generate the PDF');
    } finally {
      setDownloading(false);
    }
  };

  const downloadCsv = async () => {
    if (rows.length === 0 && !statement) return;

    // A statement generated in this session is downloaded from the rows already
    // in memory; an older one is fetched from the server as a file.
    if (statement && rows.length > 0) {
      downloadCSV(
        `${statement.accountNumber}-${statement.statementNumber}`,
        rows.map((r) => ({
          Date: formatDate(r.date),
          Reference: r.reference,
          Description: r.description,
          Type: r.type,
          Debit: r.debit || '',
          Credit: r.credit || '',
          Balance: r.balance,
        }))
      );
      toast.success('CSV downloaded');
      return;
    }

    if (!statement) return;
    setDownloading(true);
    try {
      const blob = await api.downloadStatementCsv(statement.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${statement.accountNumber}-${statement.statementNumber}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('CSV downloaded');
    } catch {
      toast.error('Could not download the statement');
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-56 skeleton" />
        <Skeleton variant="rectangular" height={160} />
        <Skeleton variant="rectangular" height={400} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Official record"
        title="Statements"
        description="Generate a period statement for any account. Rows are snapshotted at generation, so the numbers never change afterwards."
        actions={
          <>
            <Button
              variant="secondary"
              leftIcon={<FileText className="w-4 h-4" />}
              onClick={() => setShowHistory((v) => !v)}
            >
              {history.length > 0 ? `Past (${history.length})` : 'Past'}
            </Button>
            <Button variant="ghost" leftIcon={<Printer className="w-4 h-4" />} onClick={() => window.print()}>
              Print
            </Button>
          </>
        }
      />

      {/* --------------------------------------------------- period picker */}
      <Card>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-4">
            <Select
              label="Account"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              options={accounts.map((a) => ({
                value: a.id,
                label: `${a.accountType} · ${maskAccountNumber(a.accountNumber)}`,
              }))}
            />
            <Input
              label="From"
              type="date"
              max={toDate || undefined}
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              leftIcon={<Calendar className="w-4 h-4" />}
            />
            <Input
              label="To"
              type="date"
              min={fromDate || undefined}
              max={iso(new Date())}
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              leftIcon={<Calendar className="w-4 h-4" />}
            />
            <div className="flex items-end">
              <Button
                variant="brass"
                className="w-full"
                onClick={generate}
                isLoading={generating}
                leftIcon={<FileText className="w-4 h-4" />}
              >
                Generate
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {[
              { label: 'This month', days: 0 },
              { label: 'Last 30 days', days: 30 },
              { label: 'Last 90 days', days: 90 },
              { label: 'Last 6 months', days: 182 },
              { label: 'Last year', days: 365 },
            ].map((preset) => (
              <button
                key={preset.label}
                onClick={() => {
                  setFromDate(iso(daysAgo(preset.days)));
                  setToDate(iso(new Date()));
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-paper border border-border text-ink-soft hover:bg-paper-raised hover:border-brass/50 transition-colors"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------ past list */}
      {showHistory ? (
        <Card>
          <CardContent className="pt-5 sm:pt-6">
            {history.length === 0 ? (
              <EmptyState
                icon={<FileText className="w-6 h-6" />}
                title="No past statements"
                description="Generate one above and it will be saved here."
              />
            ) : (
              <ul className="divide-y divide-border/70">
                {history.map((s) => (
                  <li key={s.id}>
                    <button
                      onClick={() => openStatement(s.id)}
                      className="w-full text-left flex items-center justify-between gap-4 py-3 hover:bg-paper/60 transition-colors rounded-lg px-2 -mx-2"
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-sm text-text">{s.statementNumber}</p>
                        <p className="text-xs text-muted mt-0.5">
                          {s.accountNumber} · {s.periodLabel} · {s.transactionCount} entries
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-mono text-sm text-text">{formatCurrency(s.closingBalance)}</p>
                        <p className="text-[0.6875rem] text-muted mt-0.5">{formatDate(s.generatedAt)}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* --------------------------------------------------------- report */}
      {generating ? (
        <Card>
          <div className="p-5 sm:p-6 space-y-3">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} height={40} />
            ))}
          </div>
        </Card>
      ) : statement ? (
        <Card className="overflow-hidden print:border-0 print:shadow-none">
          {/* Statement letterhead */}
          <div className="px-5 sm:px-6 py-5 border-b border-border bg-paper/60 print:bg-white">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="min-w-0">
                <p className="font-display text-lg font-bold tracking-[0.1em] text-text">MANGAUD</p>
                <p className="text-[0.625rem] uppercase tracking-[0.22em] text-muted mt-0.5">
                  Banking Console
                </p>
              </div>
              <div className="sm:text-right">
                <p className="eyebrow">Statement</p>
                <p className="font-mono text-sm text-text mt-1">{statement.statementNumber}</p>
                <p className="text-xs text-muted mt-0.5">
                  {statement.periodLabel} · {statement.transactionCount} entries
                </p>
              </div>
            </div>
          </div>

          {/* Totals */}
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-border print:divide-border">
            {[
              { label: 'Account', value: statement.accountNumber, mono: true },
              { label: 'Opening balance', value: formatCurrency(statement.openingBalance) },
              { label: 'Closing balance', value: formatCurrency(statement.closingBalance) },
              {
                label: 'In / out',
                value: `${formatCurrency(statement.totalCredits)} / ${formatCurrency(statement.totalDebits)}`,
              },
            ].map((item) => (
              <div key={item.label} className="px-5 py-4">
                <p className="eyebrow">{item.label}</p>
                <p className={cn('mt-1.5 text-text', item.mono ? 'font-mono text-sm' : 'font-mono text-sm')}>
                  {item.value}
                </p>
              </div>
            ))}
          </div>

          {/* Rows */}
          {rows.length === 0 ? (
            <EmptyState
              icon={<Wallet className="w-6 h-6" />}
              title="No activity in this period"
              description="Try widening the date range, or pick a different account."
            />
          ) : (
            <>
              {/* Desktop: table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {['Date', 'Description', 'Reference', 'Debit', 'Credit', 'Balance'].map((h, i) => (
                        <th
                          key={h}
                          scope="col"
                          className={cn(
                            'px-4 py-3 text-[0.6875rem] font-semibold uppercase tracking-[0.09em] text-muted',
                            i >= 3 ? 'text-right' : 'text-left'
                          )}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={`${row.reference}-${i}`} className="border-b border-border/60 last:border-0 hover:bg-paper/50">
                        <td className="px-4 py-3 whitespace-nowrap text-muted text-xs">
                          {formatDate(row.date)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-text">{row.description}</span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted whitespace-nowrap">
                          {row.reference}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-danger-700 whitespace-nowrap">
                          {row.debit ? formatCurrency(row.debit) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-success-700 whitespace-nowrap">
                          {row.credit ? formatCurrency(row.credit) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-text whitespace-nowrap">
                          {formatCurrency(row.balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile: cards */}
              <ul className="md:hidden divide-y divide-border/70">
                {rows.map((row, i) => (
                  <li key={`${row.reference}-${i}`} className="px-5 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-text truncate">{row.description}</p>
                        <p className="text-[0.6875rem] text-muted mt-0.5 font-mono truncate">
                          {row.reference}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'font-mono text-sm shrink-0 flex items-center gap-0.5',
                          row.credit ? 'text-success-700' : 'text-danger-700'
                        )}
                      >
                        {row.credit ? <ArrowDown className="w-3.5 h-3.5" /> : <ArrowUp className="w-3.5 h-3.5" />}
                        {formatCurrency(row.credit || row.debit)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 mt-1.5 text-[0.6875rem] text-muted">
                      <span>{formatDate(row.date)}</span>
                      <span className="font-mono">Bal {formatCurrency(row.balance)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* Footer */}
          <div className="px-5 sm:px-6 py-4 border-t border-border bg-paper/60 flex flex-wrap items-center justify-between gap-3 print:bg-white">
            <p className="text-[0.6875rem] text-muted">
              Generated {formatDateTime(statement.generatedAt)} · figures in Indian rupees
            </p>
            <div className="flex gap-2 print:hidden">
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Download className="w-3.5 h-3.5" />}
                onClick={downloadCsv}
                isLoading={downloading}
              >
                Download CSV
              </Button>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Download className="w-3.5 h-3.5" />}
                onClick={downloadPdf}
                isLoading={downloading}
              >
                Download PDF
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <Card>
          <EmptyState
            icon={<FileText className="w-6 h-6" />}
            title="Pick a period to generate a statement"
            description="Choose an account and a date range above, then press Generate."
          />
        </Card>
      )}
    </div>
  );
}

export default Statements;
