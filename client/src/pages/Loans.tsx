import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { 
  FileText, 
  Calculator, 
  CreditCard, 
  ArrowRight,
  Eye,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  DollarSign,
  Plus
} from 'lucide-react';
import { formatCurrency, formatRelativeTime, formatDate } from '../utils/format';
import { Button, Input, Select, Card, CardHeader, CardTitle, CardDescription, CardContent, Badge, Modal, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, PageHeader, EmptyState, Skeleton } from '../components/ui';
import { useAccountStore } from '../store/accountStore';
import { usePermissions } from '../store/permissionStore';
import { api } from '../services/api';
import { Loan, LoanPayment } from '../types';
import toast from 'react-hot-toast';

const applyLoanSchema = z.object({
  accountNumber: z.string().min(1, 'Account is required'),
  principalAmount: z.number().min(1000, 'Minimum loan amount is 1,000'),
  interestRate: z.number().min(0.1, 'Interest rate must be positive').max(30, 'Interest rate cannot exceed 30%'),
  termMonths: z.number().int().min(1, 'Term must be at least 1 month').max(360, 'Term cannot exceed 360 months'),
});

type ApplyLoanForm = z.infer<typeof applyLoanSchema>;

const repayLoanSchema = z.object({
  loanId: z.string().min(1, 'Loan ID is required'),
  amount: z.number().min(0.01, 'Amount must be positive'),
  /**
   * Which of the customer's own accounts pays. Optional — omitted, the loan's own
   * account is debited. In real retail banking the loan sits on one account and
   * the money usually lives in another, so this is a choice the borrower makes.
   */
  fromAccountId: z.string().optional(),
});

type RepayLoanForm = z.infer<typeof repayLoanSchema>;

export function Loans() {
  const { accounts, loans, fetchLoans, fetchAccounts, applyLoan, fetchLoan, repayLoan, calculateLoanInterest, isLoading } = useAccountStore();
  const [activeTab, setActiveTab] = useState<'my-loans' | 'apply' | 'calculator'>('my-loans');
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [showRepayModal, setShowRepayModal] = useState(false);

  /*
    Accounts that can fund a repayment: the borrower's own, active, with money in
    them. Computed rather than listed raw so the picker cannot offer an account
    the server would refuse — an overdraw or a frozen account in a repayment
    dialog is a dead end for the customer.
  */
  const payableAccounts = accounts.filter(
    (a) => a.status === 'ACTIVE' && (a.balance ?? 0) > 0
  );
  const [showCalculatorModal, setShowCalculatorModal] = useState(false);
  const [calculatedInterest, setCalculatedInterest] = useState<number | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);

  /*
    Staff see the branch loan queue (GET /loans/all), not "my loans", because
    `my-loans` only covers a customer's own record and a branch user is not
    underwriting their own book. Customers have `loan:read:own` only, so this
    branch never fires for them: for a customer `can('loan:read:any')` is false
    and the page is the ordinary borrower view.
  */
  const { can } = usePermissions();
  const isStaffLoans = can('loan:read:any');
  const [staffLoans, setStaffLoans] = useState<any[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);

  useEffect(() => {
    fetchAccounts();
    if (isStaffLoans) {
      setStaffLoading(true);
      api
        .getAllLoans({ limit: 50 })
        .then((res) => setStaffLoans(res.data?.loans ?? []))
        .catch(() => toast.error('Failed to load the loan queue'))
        .finally(() => setStaffLoading(false));
    } else {
      fetchLoans();
    }
  }, [fetchAccounts, fetchLoans, isStaffLoans]);

  const handleApprove = async (loanId: string) => {
    try {
      await api.approveLoan(loanId);
      toast.success('Loan approved');
      const res = await api.getAllLoans({ limit: 50 });
      setStaffLoans(res.data?.loans ?? []);
    } catch (error: any) {
      toast.error(error?.response?.data?.error ?? 'Failed to approve loan');
    }
  };

  const handleDisburse = async (loanId: string) => {
    try {
      await api.disburseLoan(loanId);
      toast.success('Loan disbursed');
      const res = await api.getAllLoans({ limit: 50 });
      setStaffLoans(res.data?.loans ?? []);
    } catch (error: any) {
      toast.error(error?.response?.data?.error ?? 'Failed to disburse loan');
    }
  };

  const {
    register: registerApply,
    handleSubmit: handleSubmitApply,
    watch: watchApply,
    setValue: setApplyValue,
    formState: { errors: applyErrors },
  } = useForm<ApplyLoanForm>({
    resolver: zodResolver(applyLoanSchema),
  });

  const {
    register: registerRepay,
    handleSubmit: handleSubmitRepay,
    setValue: setRepayValue,
    formState: { errors: repayErrors },
  } = useForm<RepayLoanForm>({
    resolver: zodResolver(repayLoanSchema),
  });

  const principalAmount = watchApply('principalAmount') || 0;
  const interestRate = watchApply('interestRate') || 0;
  const termMonths = watchApply('termMonths') || 0;

  const calculateEMI = () => {
    if (!principalAmount || !interestRate || !termMonths) return 0;
    const monthlyRate = interestRate / 100 / 12;
    if (monthlyRate === 0) return principalAmount / termMonths;
    const emi = (principalAmount * monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / 
                (Math.pow(1 + monthlyRate, termMonths) - 1);
    return emi;
  };

  const emi = calculateEMI();

  const handleApplyLoan = async (data: ApplyLoanForm) => {
    try {
      await applyLoan(data);
      toast.success('Loan application submitted successfully!');
      (Object.keys(data) as Array<keyof ApplyLoanForm>).forEach((key) => {
        registerApply(key).onChange({ target: { value: '' } });
      });
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to apply for loan');
    }
  };

  const handleRepayLoan = async (data: RepayLoanForm) => {
    try {
      await repayLoan(data.loanId, data.amount, data.fromAccountId);
      toast.success('Repayment received. Thank you.');
      setShowRepayModal(false);
      if (selectedLoan) {
        fetchLoan(selectedLoan.id);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to process repayment');
    }
  };

  const handleCalculateInterest = async (loan: Loan) => {
    try {
      // The store and API both take ISO date strings, not Date objects.
      const fromDate = new Date(
        loan.disbursedAt || loan.approvedAt || loan.appliedAt
      ).toISOString();
      const toDate = new Date().toISOString();
      const interest = await calculateLoanInterest(loan.id, fromDate, toDate);
      setCalculatedInterest(interest);
      setSelectedLoan(loan);
      setShowCalculatorModal(true);
    } catch (error: any) {
      toast.error('Failed to calculate interest');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'DISBURSED': return <CheckCircle className="w-4 h-4 text-success-700" />;
      case 'APPROVED': return <Clock className="w-4 h-4 text-warning-700" />;
      case 'APPLIED': return <Clock className="w-4 h-4 text-primary-700" />;
      case 'CLOSED': return <CheckCircle className="w-4 h-4 text-muted" />;
      case 'REJECTED': return <XCircle className="w-4 h-4 text-danger-700" />;
      default: return <FileText className="w-4 h-4 text-muted" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DISBURSED': return <Badge variant="success">{status}</Badge>;
      case 'APPROVED': return <Badge variant="warning">{status}</Badge>;
      case 'APPLIED': return <Badge variant="info">{status}</Badge>;
      case 'CLOSED': return <Badge variant="gray">{status}</Badge>;
      case 'REJECTED': return <Badge variant="danger">{status}</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  const formatStatus = (status: string) => {
    return status.charAt(0) + status.slice(1).toLowerCase();
  };

  /*
    Staff land on the branch queue instead of their own (nonexistent) loans.
    The approve/disburse buttons ride the same permission model as the server:
    the button is absent when the role cannot call it, so a loan officer sees
    Approve but never Disburse, and a customer never sees either.
  */
  if (isStaffLoans) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Credit"
          title="Loan applications"
          description="The branch book. Approve where you hold that power, and hand off for disbursal where you do not."
        />
        {staffLoading ? (
          <Card><CardContent><Skeleton className="h-64 w-full" /></CardContent></Card>
        ) : staffLoans.length === 0 ? (
          <EmptyState title="Queue is clear" description="No applications in your branch to assess." />
        ) : (
          <Card>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Principal</TableHead>
                      <TableHead>Rate</TableHead>
                      <TableHead>Term</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staffLoans.map((l: any) => (
                      <TableRow key={l.id ?? l._id}>
                        <TableCell className="font-medium">{l.accountNumber ?? l.id}</TableCell>
                        <TableCell>{formatCurrency(l.principalAmount ?? 0)}</TableCell>
                        <TableCell>{l.interestRate}%</TableCell>
                        <TableCell>{l.termMonths} mo</TableCell>
                        <TableCell>
                          <Badge variant={l.status === 'DISBURSED' ? 'success' : l.status === 'APPROVED' ? 'warning' : l.status === 'REJECTED' ? 'danger' : 'info'}>
                            {l.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {can('loan:approve') && l.status === 'APPLIED' ? (
                              <Button size="sm" variant="brand" onClick={() => void handleApprove(l.id ?? l._id)}>
                                Approve
                              </Button>
                            ) : null}
                            {can('loan:disburse') && l.status === 'APPROVED' ? (
                              <Button size="sm" onClick={() => void handleDisburse(l.id ?? l._id)}>
                                Disburse
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  if (activeTab === 'my-loans') {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text">Loans</h1>
            <p className="text-muted mt-1">Manage your loan applications and repayments</p>
          </div>
          <Button onClick={() => setActiveTab('apply')} leftIcon={<Plus className="w-4 h-4" />}>
            Apply for Loan
          </Button>
        </div>

        <div className="flex gap-2 border-b border-border mb-6">
          {[
            { id: 'my-loans', label: 'My Loans', icon: FileText },
            { id: 'apply', label: 'Apply for Loan', icon: Plus },
            { id: 'calculator', label: 'EMI Calculator', icon: Calculator },
          ].map((tab) => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? 'primary' : 'ghost'}
              onClick={() => setActiveTab(tab.id as any)}
              className="flex-1"
              leftIcon={<tab.icon className="w-4 h-4" />}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        {loans.length === 0 ? (
          <Card className="text-center py-12">
            <FileText className="w-16 h-16 text-muted mx-auto mb-4" />
            <h3 className="text-lg font-medium text-text mb-2">No loans yet</h3>
            <p className="text-muted mb-6">Apply for a loan to get started</p>
            <Button onClick={() => setActiveTab('apply')} leftIcon={<Plus className="w-4 h-4" />}>
              Apply for Loan
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {loans.map((loan) => (
              <Card key={loan.id} className="card-hover">
                <CardContent className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="md:col-span-2">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-text">Loan #{loan.id.slice(-8)}</h3>
                            {getStatusIcon(loan.status)}
                          </div>
                          <p className="text-sm text-muted mb-2">Account: {loan.account?.accountNumber || 'N/A'}</p>
                          <div className="flex items-center gap-4 text-sm text-muted">
                            <span>Applied: {formatDate(loan.appliedAt)}</span>
                            {loan.approvedAt && <span>Approved: {formatDate(loan.approvedAt)}</span>}
                            {loan.disbursedAt && <span>Disbursed: {formatDate(loan.disbursedAt)}</span>}
                          </div>
                        </div>
                        <div className="text-right">
                          {getStatusBadge(loan.status)}
                        </div>
                      </div>
                      
                      <div className="mt-4 h-3 bg-rule rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary-600 transition-all duration-500"
                          style={{ width: `${loan.progressPercentage || 0}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-sm text-muted mt-1">
                        <span>Progress: {loan.progressPercentage || 0}%</span>
                        <span>Paid: {formatCurrency(loan.totalPaid || 0)} / {formatCurrency(loan.principalAmount)}</span>
                      </div>
                    </div>

                    <div className="md:col-span-1">
                      <div className="space-y-3 text-right">
                        <div>
                          <p className="text-sm text-muted">Principal</p>
                          <p className="text-xl font-bold text-text">{formatCurrency(loan.principalAmount)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted">Outstanding</p>
                          <p className="text-xl font-bold text-text">{formatCurrency(loan.outstandingAmount)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted">Interest Rate</p>
                          <p className="text-lg font-semibold text-text">{loan.interestRate}%</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted">EMI</p>
                          <p className="text-lg font-semibold text-text">{formatCurrency(loan.emiAmount || 0)}/mo</p>
                        </div>
                      </div>

                    <div className="md:col-span-1">
                      <div className="space-y-2">
                        {loan.status === 'DISBURSED' && loan.outstandingAmount > 0 && (
                          <Button 
                            variant="success" 
                            className="w-full" 
                            leftIcon={<DollarSign className="w-4 h-4" />}
                            onClick={() => {
                              /*
                                `setValue`, not `register(...).onChange(...)`.

                                Hand-calling a react-hook-form `onChange` outside
                                React's event system is not a supported way to
                                set a value.
                              */
                              setRepayValue('loanId', loan.id);
                              setRepayValue('amount', Number(loan.emiAmount ?? 0));
                              setRepayValue('fromAccountId', '');
                              setSelectedLoan(loan);
                              setShowRepayModal(true);
                            }}
                          >
                            Make Payment
                          </Button>
                        )}
                        {loan.status === 'DISBURSED' && (
                          <Button
                            variant="outline"
                            className="w-full"
                            leftIcon={<Calculator className="w-4 h-4" />}
                            onClick={() => void handleCalculateInterest(loan)}
                          >
                            Calculate Interest
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          className="w-full"
                          leftIcon={<Eye className="w-4 h-4" />}
                          onClick={() => {
                            setSelectedLoan(loan);
                            setShowDetailsModal(true);
                          }}
                        >
                          View Details
                        </Button>
                      </div>
                    </div>
                  </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      {/* Loan details dialog launched by "View Details". Gives the
          borrower the full picture of one application without leaving
          the list. A placeholder for a richer view that someone had
          intended but never finished. */}
      <Modal
        isOpen={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
        title={selectedLoan ? `Loan #${(selectedLoan.id ?? '').slice(-8)}` : 'Loan details'}
        description={selectedLoan ? `${selectedLoan.termMonths}mo at ${selectedLoan.interestRate}%` : undefined}
      >
        {selectedLoan ? (
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Status</dt><dd><Badge variant={selectedLoan.status === 'DISBURSED' ? 'success' : selectedLoan.status === 'APPROVED' ? 'warning' : selectedLoan.status === 'REJECTED' ? 'danger' : 'info'}>{selectedLoan.status}</Badge></dd></div>
            <div className="flex justify-between"><dt className="text-muted">Principal</dt><dd className="font-semibold">{formatCurrency(selectedLoan.principalAmount ?? 0)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Outstanding</dt><dd className="font-semibold">{formatCurrency(selectedLoan.outstandingAmount ?? 0)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">EMI</dt><dd className="font-semibold">{formatCurrency(selectedLoan.emiAmount ?? 0)}/mo</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Interest rate</dt><dd>{selectedLoan.interestRate}%</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Term</dt><dd>{selectedLoan.termMonths} months</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Applied</dt><dd>{selectedLoan.appliedAt ? formatDate(selectedLoan.appliedAt) : '—'}</dd></div>
            {selectedLoan.disbursedAt ? (
              <div className="flex justify-between"><dt className="text-muted">Disbursed</dt><dd>{formatDate(selectedLoan.disbursedAt)}</dd></div>
            ) : null}
          </dl>
        ) : null}
      </Modal>

      {/* Interest calculator result. Populated by "Calculate Interest" on a loan, which
          sets the bound loan and the accrued amount, then opens this dialog. */}
      <Modal
        isOpen={showCalculatorModal}
        onClose={() => { setShowCalculatorModal(false); setCalculatedInterest(null); }}
        title="Interest accrued"
        description={selectedLoan ? `Up to today · ${selectedLoan.termMonths}mo at ${selectedLoan.interestRate}%` : undefined}
      >
        {calculatedInterest !== null ? (
          <p className="text-2xl font-semibold text-text">{formatCurrency(calculatedInterest)}</p>
        ) : null}
        <p className="text-xs text-muted mt-3">Estimated. Principal accrues interest in the order contract date → maturity.</p>
      </Modal>

      {/*
        The repayment dialog.

        `showRepayModal` was set to true by "Make Payment" but nothing rendered it
        — the button opened nothing at all, so a customer could not repay a loan
        from the app even though the API had supported it since the beginning. The
        customer is the account holder: this is the single most basic thing they
        must be able to do themselves.

        It also asks *which* of their accounts pays. The loan lives on one account
        and the money is usually in another; hard-coding the loan's own account
        would force a pointless transfer first. The server re-checks that the
        chosen account belongs to the same customer.
      */}
      <Modal
        isOpen={showRepayModal}
        onClose={() => setShowRepayModal(false)}
        title="Make a repayment"
        description={
          selectedLoan
            ? `${selectedLoan.termMonths}-month loan at ${selectedLoan.interestRate}% · ${formatCurrency(
                selectedLoan.outstandingAmount ?? 0
              )} outstanding`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowRepayModal(false)}>
              Cancel
            </Button>
            <Button
              variant="success"
              form="repay-loan-form"
              type="submit"
              isLoading={isLoading}
              leftIcon={<DollarSign className="w-4 h-4" />}
            >
              Pay now
            </Button>
          </>
        }
      >
        <form
          id="repay-loan-form"
          onSubmit={handleSubmitRepay(handleRepayLoan)}
          className="space-y-4"
        >
          <input type="hidden" {...registerRepay('loanId')} />

          <Input
            label="Amount"
            type="number"
            min="0.01"
            step="0.01"
            placeholder="0.00"
            {...registerRepay('amount', { valueAsNumber: true })}
            error={repayErrors.amount?.message}
            hint={
              selectedLoan?.emiAmount
                ? `One EMI is ${formatCurrency(selectedLoan.emiAmount)}.`
                : undefined
            }
          />

          {payableAccounts.length > 0 ? (
            <Select
              label="Pay from"
              placeholder="The account this loan was taken against"
              options={[
                { value: '', label: "The loan's own account" },
                ...payableAccounts.map((a) => ({
                  value: a.id,
                  label: `${a.accountType} · ${a.accountNumber} · ${formatCurrency(a.balance)}`,
                })),
              ]}
              {...registerRepay('fromAccountId')}
            />
          ) : null}

          <p className="text-xs leading-relaxed text-muted">
            Interest applies to the outstanding principal first and the remainder reduces it.
            The outstanding figure above is the most that can be paid in one go.
          </p>
        </form>
      </Modal>
      </div>
    );
  }

  if (activeTab === 'apply') {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-text">Apply for Loan</h1>
          <p className="text-muted mt-1">Submit a new loan application</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Loan Application</CardTitle>
            <CardDescription>Fill in the details to apply for a loan</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmitApply(handleApplyLoan)} className="space-y-4">
              <Select
                label="Account"
                placeholder="Select an account"
                options={accounts.map(acc => ({ value: acc.accountNumber, label: `${acc.accountType} - ${acc.accountNumber} (${formatCurrency(acc.balance)})` }))}
                error={applyErrors.accountNumber?.message}
                {...registerApply('accountNumber')}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Principal Amount"
                  type="number"
                  placeholder="100000"
                  min="1000"
                  step="1000"
                  {...registerApply('principalAmount', { valueAsNumber: true })}
                  error={applyErrors.principalAmount?.message}
                />
                <Input
                  label="Interest Rate (% per annum)"
                  type="number"
                  placeholder="10.00"
                  min="0.1"
                  max="30"
                  step="0.1"
                  {...registerApply('interestRate', { valueAsNumber: true })}
                  error={applyErrors.interestRate?.message}
                />
              </div>

              <Input
                label="Term (Months)"
                type="number"
                placeholder="24"
                min="1"
                max="360"
                {...registerApply('termMonths', { valueAsNumber: true })}
                error={applyErrors.termMonths?.message}
              />

              {principalAmount > 0 && interestRate > 0 && termMonths > 0 && (
                <div className="p-4 rounded-lg bg-primary-50 border border-primary-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted">Estimated EMI</span>
                    <span className="text-xl font-bold text-primary-600">{formatCurrency(emi)}/month</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-muted">Total Payable</p>
                      <p className="font-semibold text-text">{formatCurrency(emi * termMonths)}</p>
                    </div>
                    <div>
                      <p className="text-muted">Total Interest</p>
                      <p className="font-semibold text-text">{formatCurrency((emi * termMonths) - principalAmount)}</p>
                    </div>
                    <div>
                      <p className="text-muted">Interest Rate</p>
                      <p className="font-semibold text-text">{interestRate}% p.a.</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="secondary" onClick={() => setActiveTab('my-loans')}>
                  Cancel
                </Button>
                <Button type="submit" size="lg" isLoading={isLoading} leftIcon={<FileText className="w-4 h-4" />}>
                  Submit Application
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (activeTab === 'calculator') {
    return (
      <>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-text">EMI Calculator</h1>
          <p className="text-muted mt-1">Calculate your monthly loan payments</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Loan EMI Calculator</CardTitle>
            <CardDescription>Estimate your monthly payments</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Loan Amount"
                type="number"
                placeholder="100000"
                min="1000"
                step="1000"
                onChange={(e) => setApplyValue('principalAmount', Number(e.target.value))}
              />
              <Input
                label="Interest Rate (% p.a.)"
                type="number"
                placeholder="10.00"
                min="0.1"
                max="30"
                step="0.1"
                onChange={(e) => setApplyValue('interestRate', Number(e.target.value))}
              />
            </div>

            <Input
              label="Loan Term (Months)"
              type="number"
              placeholder="24"
              min="1"
              max="360"
              onChange={(e) => setApplyValue('termMonths', Number(e.target.value))}
            />

            {principalAmount > 0 && interestRate > 0 && termMonths > 0 && (
              <div className="space-y-4 p-6 rounded-xl bg-sunken">
                <div className="flex items-center justify-between">
                  <span className="text-lg text-muted">Monthly EMI</span>
                  <span className="text-3xl font-bold text-primary-600">{formatCurrency(emi)}</span>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 bg-white rounded-lg">
                    <p className="text-sm text-muted">Principal Amount</p>
                    <p className="text-xl font-semibold text-text">{formatCurrency(principalAmount)}</p>
                  </div>
                  <div className="p-4 bg-white rounded-lg">
                    <p className="text-sm text-muted">Total Interest</p>
                    <p className="text-xl font-semibold text-text">{formatCurrency((emi * termMonths) - principalAmount)}</p>
                  </div>
                  <div className="p-4 bg-white rounded-lg">
                    <p className="text-sm text-muted">Total Payable</p>
                    <p className="text-xl font-semibold text-text">{formatCurrency(emi * termMonths)}</p>
                  </div>
                </div>
                <div className="pt-4 border-t border-border">
                  <p className="text-sm text-muted">
                    This is an estimate. Actual EMI may vary based on processing fees, insurance, and other charges.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      </>
    );
  }

  return null;
}
