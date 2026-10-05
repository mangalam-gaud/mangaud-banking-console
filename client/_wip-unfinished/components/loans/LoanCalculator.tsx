import { useState, useMemo, useEffect } from 'react';
import { Calculator, CreditCard, ArrowRight, TrendingUp, Minus, Plus, DollarSign, AlertCircle } from 'lucide-react';
import { formatCurrency } from '../../utils/format';
import { 
  Button, Input, Card, CardHeader, CardTitle, CardDescription, CardContent, Badge,
  Select, Slider, Switch
} from '../../ui';
import { cn } from '../../utils/cn';

interface LoanCalculatorProps {
  initialAmount?: number;
  initialRate?: number;
  initialTerm?: number;
  onApply?: (data: LoanApplicationData) => void;
}

interface LoanApplicationData {
  accountNumber: string;
  principalAmount: number;
  interestRate: number;
  termMonths: number;
}

interface AmortizationRow {
  month: number;
  payment: number;
  principal: number;
  interest: number;
  remainingBalance: number;
}

export function LoanCalculator({ 
  initialAmount = 100000, 
  initialRate = 10, 
  initialTerm = 24,
  onApply 
}: LoanCalculatorProps) {
  const [amount, setAmount] = useState(initialAmount);
  const [rate, setRate] = useState(initialRate);
  const [term, setTerm] = useState(initialTerm);
  const [frequency, setFrequency] = useState<'monthly' | 'biweekly' | 'weekly'>('monthly');
  const [showAmortization, setShowAmortization] = useState(false);
  const [extraPayment, setExtraPayment] = useState(0);
  const [showExtraPayment, setShowExtraPayment] = useState(false);
  
  // Calculated values
  const monthlyRate = rate / 100 / 12;
  const totalPayments = term;
  
  const emi = useMemo(() => {
    if (monthlyRate === 0) return amount / term;
    return (amount * monthlyRate * Math.pow(1 + monthlyRate, term)) / 
           (Math.pow(1 + monthlyRate, term) - 1);
  }, [amount, rate, term]);

  const totalPayable = emi * term;
  const totalInterest = totalPayable - amount;
  const interestPercentage = (totalInterest / amount) * 100;

  // Generate amortization schedule
  const amortizationSchedule = useMemo((): AmortizationRow[] => {
    const schedule: AmortizationRow[] = [];
    let balance = amount;
    
    for (let i = 1; i <= term; i++) {
      const interestPayment = balance * monthlyRate;
      const principalPayment = emi - interestPayment;
      balance -= principalPayment;
      
      schedule.push({
        month: i,
        payment: emi,
        principal: principalPayment,
        interest: interestPayment,
        remainingBalance: Math.max(0, balance),
      });
    }
    
    return schedule;
  }, [amount, emi, monthlyRate, term]);

  // With extra payment
  const scheduleWithExtra = useMemo(() => {
    if (extraPayment <= 0) return null;
    
    const schedule: AmortizationRow[] = [];
    let balance = amount;
    let month = 0;
    
    while (balance > 0 && month < term * 2) { // Safety limit
      month++;
      const interestPayment = balance * monthlyRate;
      let principalPayment = emi - interestPayment + extraPayment;
      
      if (principalPayment > balance) {
        principalPayment = balance;
      }
      
      balance -= principalPayment;
      
      schedule.push({
        month,
        payment: emi + extraPayment,
        principal: principalPayment,
        interest: interestPayment,
        remainingBalance: Math.max(0, balance),
      });
      
      if (balance <= 0) break;
    }
    
    return schedule;
  }, [amount, emi, monthlyRate, term, extraPayment]);

  const effectiveSchedule = extraPayment > 0 ? scheduleWithExtra : amortizationSchedule;
  const totalMonthsWithExtra = effectiveSchedule?.length || term;
  const timeSaved = term - totalMonthsWithExtra;
  const interestSaved = useMemo(() => {
    if (!scheduleWithExtra) return 0;
    const originalInterest = amortizationSchedule.reduce((sum, row) => sum + row.interest, 0);
    const newInterest = effectiveSchedule.reduce((sum, row) => sum + row.interest, 0);
    return originalInterest - newInterest;
  }, [amortizationSchedule, effectiveSchedule]);

  const handleAmountChange = (value: string) => {
    const num = parseFloat(value.replace(/[^0-9.]/g, ''));
    if (!isNaN(num)) setAmount(num);
  };

  const handleRateChange = (value: string) => {
    const num = parseFloat(value.replace(/[^0-9.]/g, ''));
    if (!isNaN(num) && num >= 0.1 && num <= 30) setRate(num);
  };

  const handleTermChange = (value: string) => {
    const num = parseInt(value.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(num) && num >= 1 && num <= 360) setTerm(num);
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="w-5 h-5" />
          Loan EMI Calculator
        </CardTitle>
        <CardDescription>Calculate your monthly payments and see the full breakdown</CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Input Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="label">Loan Amount (₹)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">₹</span>
                <Input
                  type="text"
                  value={amount.toLocaleString('en-IN')}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  placeholder="1,00,000"
                  className="pl-6 pr-10"
                />
              </div>
              <Slider
                value={[amount]}
                onValueChange={([v]) => setAmount(v)}
                min={1000}
                max={10000000}
                step={1000}
                className="mt-2"
              />
              <div className="flex justify-between text-sm text-muted">
                <span>₹1,000</span>
                <span>₹1 Cr</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Interest Rate (% p.a.)</label>
                <div className="relative">
                  <Input
                    type="text"
                    value={rate.toFixed(2)}
                    onChange={(e) => handleRateChange(e.target.value)}
                    placeholder="10.00"
                    className="pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">%</span>
                </div>
                <Slider
                  value={[rate]}
                  onValueChange={([v]) => setRate(v)}
                  min={0.1}
                  max={30}
                  step={0.1}
                  className="mt-2"
                />
              </div>
              <div>
                <label className="label">Loan Term (Months)</label>
                <div className="relative">
                  <Input
                    type="text"
                    value={term.toString()}
                    onChange={(e) => handleTermChange(e.target.value)}
                    placeholder="24"
                    className="pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">months</span>
                </div>
                <Slider
                  value={[term]}
                  onValueChange={([v]) => setTerm(v)}
                  min={1}
                  max={360}
                  step={1}
                  className="mt-2"
                />
              </div>
            </div>

            <div>
              <label className="label">Payment Frequency</label>
              <Select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as any)}
                options={[
                  { value: 'monthly', label: 'Monthly' },
                  { value: 'biweekly', label: 'Bi-weekly' },
                  { value: 'weekly', label: 'Weekly' },
                ]}
              />
            </div>

            <div className="flex items-center gap-3">
              <Switch
                checked={showExtraPayment}
                onCheckedChange={setShowExtraPayment}
              />
              <label className="cursor-pointer font-medium text-text">
                Add Extra Payment
              </label>
            </div>

            {showExtraPayment && (
              <div className="space-y-2">
                <label className="label">Extra Payment per Period (₹)</label>
                <div className="relative">
                  <Input
                    type="number"
                    value={extraPayment}
                    onChange={(e) => setExtraPayment(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    min="0"
                  />
                </div>
                <p className="text-sm text-muted">
                  This will reduce your loan term by {timeSaved} months and save ₹{formatCurrency(interestSaved)} in interest
                </p>
              </div>
            )}

            <Select
              placeholder="Select Account"
              options={[
                { value: 'ACC001', label: 'Savings - ACC001 (₹50,000)' },
                { value: 'ACC002', label: 'Current - ACC002 (₹25,000)' },
              ]}
              className="mt-4"
            />
          </div>

          {/* Results Section */}
          <div className="lg:col-span-1">
            <div className="space-y-4">
              <div className={cn('p-6 rounded-xl', 'bg-gradient-to-br from-primary-50 to-primary-100 dark:from-primary-900/30 dark:to-primary-800/30')}>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-primary-700 dark:text-primary-300 font-medium">Monthly EMI</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-primary-700 dark:text-primary-300">
                    {formatCurrency(emi)}
                  </span>
                  <span className="text-primary-500 dark:text-primary-400">/month</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-border">
                  <p className="text-sm text-muted">Principal Amount</p>
                  <p className="text-xl font-bold text-text">{formatCurrency(amount)}</p>
                </div>
                <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-border">
                  <p className="text-sm text-muted">Total Interest</p>
                  <p className="text-xl font-bold text-text">{formatCurrency(totalInterest)}</p>
                </div>
                <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-border">
                  <p className="text-sm text-muted">Total Payable</p>
                  <p className="text-xl font-bold text-text">{formatCurrency(totalPayable)}</p>
                </div>
                <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-border">
                  <p className="text-sm text-muted">Interest % of Principal</p>
                  <p className="text-xl font-bold text-text">{interestPercentage.toFixed(1)}%</p>
                </div>
              </div>

              {extraPayment > 0 && (
                <div className="p-4 rounded-xl bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-green-700 dark:text-green-300">Savings with Extra Payment</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-2 text-sm">
                    <div>
                      <p className="text-muted">Time Saved</p>
                      <p className="font-bold text-green-700 dark:text-green-300">{timeSaved} months</p>
                    </div>
                    <div>
                      <p className="text-muted">Interest Saved</p>
                      <p className="font-bold text-green-700 dark:text-green-300">{formatCurrency(interestSaved)}</p>
                    </div>
                    <div>
                      <p className="text-muted">New Term</p>
                      <p className="font-bold text-green-700 dark:text-green-300">{effectiveSchedule?.length || term} months</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-border">
                <Button 
                  className="w-full" 
                  size="lg" 
                  leftIcon={<CreditCard className="w-4 h-4" />}
                  onClick={() => onApply?.({
                    accountNumber: 'ACC001',
                    principalAmount: amount,
                    interestRate: rate,
                    termMonths: term,
                  })}
                >
                  Apply for Loan
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full mt-2"
                  onClick={() => setShowAmortization(!showAmortization)}
                >
                  {showAmortization ? 'Hide' : 'Show'} Amortization Schedule
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Amortization Schedule */}
        {showAmortization && (
          <div className="animate-slide-down">
            <h3 className="text-lg font-semibold text-text mb-4">Amortization Schedule</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-2 text-left font-semibold text-text">Month</th>
                    <th className="px-4 py-2 text-left font-semibold text-text">Payment</th>
                    <th className="px-4 py-2 text-left font-semibold text-text">Principal</th>
                    <th className="px-4 py-2 text-left font-semibold text-text">Interest</th>
                    <th className="px-4 py-2 text-left font-semibold text-text">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {effectiveSchedule?.slice(0, 12).map((row) => (
                    <tr key={row.month} className="border-b border-border/50 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-2 text-text">{row.month}</td>
                      <td className="px-4 py-2 text-text">{formatCurrency(row.payment)}</td>
                      <td className="px-4 py-2 text-green-600 dark:text-green-400">{formatCurrency(row.principal)}</td>
                      <td className="px-4 py-2 text-red-600 dark:text-red-400">{formatCurrency(row.interest)}</td>
                      <td className="px-4 py-2 font-medium text-text">{formatCurrency(row.remainingBalance)}</td>
                    </tr>
                  ))}
                  {(effectiveSchedule?.length || 0) > 12 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-3 text-center text-muted">
                        Showing first 12 of {effectiveSchedule?.length || term} months
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function LoanComparison({ loans: loanOptions }: { loans: Array<{name: string; amount: number; rate: number; term: number}> }) {
  const [selectedLoan, setSelectedLoan] = useState(loanOptions[0]);

  const calculations = useMemo(() => {
    return loanOptions.map(loan => {
      const monthlyRate = loan.rate / 100 / 12;
      const emi = monthlyRate === 0 
        ? loan.amount / loan.term 
        : (loan.amount * monthlyRate * Math.pow(1 + monthlyRate, loan.term)) / 
          (Math.pow(1 + monthlyRate, loan.term) - 1);
      return {
        ...loan,
        emi,
        totalPayable: emi * loan.term,
        totalInterest: emi * loan.term - loan.amount,
      };
    });
  }, [loanOptions]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Loan Comparison</CardTitle>
        <CardDescription>Compare different loan options side by side</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left font-semibold text-text">Parameter</th>
                {calculations.map(loan => (
                  <th key={loan.name} className="px-4 py-2 text-center font-semibold text-text">
                    {loan.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/50">
                <td className="px-4 py-2 text-text">Loan Amount</td>
                {calculations.map(loan => (
                  <td key={loan.name} className="px-4 py-2 text-center text-text">
                    {formatCurrency(loan.amount)}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-border/50">
                <td className="px-4 py-2 text-text">Interest Rate</td>
                {calculations.map(loan => (
                  <td key={loan.name} className="px-4 py-2 text-center text-text">
                    {loan.rate}% p.a.
                  </td>
                ))}
              </tr>
              <tr className="border-b border-border/50">
                <td className="px-4 py-2 text-text">Loan Term</td>
                {calculations.map(loan => (
                  <td key={loan.name} className="px-4 py-2 text-center text-text">
                    {loan.term} months
                  </td>
                ))}
              </tr>
              <tr className="border-b border-border/50">
                <td className="px-4 py-2 text-text">Monthly EMI</td>
                {calculations.map(loan => (
                  <td key={loan.name} className="px-4 py-2 text-center font-semibold text-primary-600">
                    {formatCurrency(loan.emi)}/mo
                  </td>
                ))}
              </tr>
              <tr className="border-b border-border/50">
                <td className="px-4 py-2 text-text">Total Interest</td>
                {calculations.map(loan => (
                  <td key={loan.name} className="px-4 py-2 text-center text-red-600">
                    {formatCurrency(loan.totalInterest)}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-border/50">
                <td className="px-4 py-2 text-text">Total Payable</td>
                {calculations.map(loan => (
                  <td key={loan.name} className="px-4 py-2 text-center font-semibold text-text">
                    {formatCurrency(loan.totalPayable)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          
          <div className="mt-4 flex gap-2">
            {calculations.map(loan => (
              <Button 
                key={loan.name}
                variant={selectedLoan.name === loan.name ? 'primary' : 'outline'}
                onClick={() => setSelectedLoan(loan)}
                className="flex-1"
              >
                Select {loan.name}
              </Button>
            ))}
          </div>
        </CardContent>
    </Card>
  );
}