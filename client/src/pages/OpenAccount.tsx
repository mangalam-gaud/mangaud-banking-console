import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, CreditCard, Building2, DollarSign } from 'lucide-react';
import { Button, Input, Select, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Badge } from '../components/ui';
import { useAccountStore } from '../store/accountStore';
import { usePermissions } from '../store/permissionStore';
import { api } from '../services/api';
import toast from 'react-hot-toast';
import { formatCurrency } from '../utils/format';

const openAccountSchema = z.object({
  accountType: z.enum(['SAVINGS', 'CURRENT', 'SALARY']),
  initialDeposit: z.number().min(0, 'Initial deposit cannot be negative').optional().default(0),
  currency: z.string().length(3).optional().default('INR'),
});

type OpenAccountForm = z.infer<typeof openAccountSchema>;

const accountTypes = [
  { value: 'SAVINGS', label: 'Savings Account', description: 'Earn 4% interest annually', icon: CreditCard },
  { value: 'CURRENT', label: 'Current Account', description: 'No interest, unlimited transactions', icon: Building2 },
  { value: 'SALARY', label: 'Salary Account', description: 'Earn 3% interest, zero minimum balance', icon: DollarSign },
];

export function OpenAccount() {
  const { createAccount, isLoading } = useAccountStore();
  const [selectedType, setSelectedType] = useState<'SAVINGS' | 'CURRENT' | 'SALARY'>('SAVINGS');

  /*
    The counter workflow.

    A teller or manager holds `account:open:any` and can open an account for a
    customer their branch serves. The API required a `customerId` for that, and
    there was no way to supply one from here — the capability existed on the
    server and was unreachable in the app, which is the same dead-end shape the
    audit looks for on the permission side.

    So: staff get a customer lookup, and the initial-deposit box is replaced by
    an explanation. The server refuses a non-zero opening balance on a branch
    account — cash tendered at the counter is recorded as a deposit on the new
    account instead, which is auditable. Offering a control here that the API
    rejects would be worse than not offering it.
  */
  const { can, isStaff } = usePermissions();
  const canOpenForOthers = isStaff && can('account:open:any');

  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState<any[]>([]);
  const [chosenCustomer, setChosenCustomer] = useState<any | null>(null);
  const [searching, setSearching] = useState(false);
  const [counterError, setCounterError] = useState('');

  const searchCustomers = async () => {
    if (customerQuery.trim().length < 2) return;
    setSearching(true);
    setCounterError('');
    try {
      const res = await api.searchCustomers(customerQuery.trim());
      const found = res.data?.customers ?? [];
      setCustomerResults(found);
      if (found.length === 0) {
        setCounterError(
          `No customer in your branch matches “${customerQuery.trim()}”. Another branch may serve them.`
        );
      }
    } catch (error: any) {
      setCounterError(error?.response?.data?.error || 'Could not search customers');
    } finally {
      setSearching(false);
    }
  };

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<OpenAccountForm>({
    resolver: zodResolver(openAccountSchema),
    defaultValues: {
      accountType: 'SAVINGS',
      initialDeposit: 0,
      currency: 'INR',
    },
  });

  const initialDeposit = watch('initialDeposit') || 0;

  const handleSubmitForm = async (data: OpenAccountForm) => {
    if (canOpenForOthers && !chosenCustomer) {
      setCounterError('Choose the customer this account is for');
      return;
    }
    try {
      await createAccount({
        ...data,
        // A branch-opened account always starts at zero; the server rejects any
        // other value, so the field is not even sent as editable.
        initialDeposit: canOpenForOthers ? 0 : data.initialDeposit,
        customerId: canOpenForOthers ? chosenCustomer?.id : undefined,
      });
      toast.success(
        canOpenForOthers
          ? `Account opened for ${chosenCustomer?.firstName} ${chosenCustomer?.lastName}`
          : 'Account created successfully!'
      );
      setValue('initialDeposit', 0);
      setChosenCustomer(null);
      setCustomerResults([]);
      setCustomerQuery('');
    } catch (error: any) {
      toast.error(error?.response?.data?.error || error?.message || 'Failed to create account');
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-text">
          {canOpenForOthers ? 'Open an account at the counter' : 'Open a new account'}
        </h1>
        <p className="text-muted mt-1">
          {canOpenForOthers
            ? 'For a customer served by your branch. The account starts at zero balance.'
            : 'Create a new bank account with your preferred settings'}
        </p>
      </div>

      {/* Counter: who this account is for. */}
      {canOpenForOthers ? (
        <Card>
          <CardHeader>
            <CardTitle>Customer</CardTitle>
            <CardDescription>
              Search your branch by name, phone or email. You can only open accounts
              for customers your branch serves.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  label="Search customer"
                  placeholder="e.g. Meera or 98200 00000"
                  value={customerQuery}
                  onChange={(e) => setCustomerQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      searchCustomers();
                    }
                  }}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                className="mt-7"
                onClick={searchCustomers}
                isLoading={searching}
              >
                Find
              </Button>
            </div>

            {counterError ? (
              <p role="alert" className="text-sm text-danger-600">
                {counterError}
              </p>
            ) : null}

            {chosenCustomer ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-brand-line bg-brand-quiet px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-text truncate">
                    {chosenCustomer.firstName} {chosenCustomer.lastName}
                  </p>
                  <p className="text-xs text-muted truncate font-mono">{chosenCustomer.email}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setChosenCustomer(null);
                    setCustomerResults([]);
                  }}
                >
                  Change
                </Button>
              </div>
            ) : customerResults.length > 0 ? (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {customerResults.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setChosenCustomer(c);
                        setCustomerResults([]);
                        setCounterError('');
                      }}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-sunken"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-text truncate">
                          {c.firstName} {c.lastName}
                        </span>
                        <span className="block text-xs text-muted truncate font-mono">
                          {c.phone}
                        </span>
                      </span>
                      <span className="eyebrow shrink-0">{c.branchCode}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Account Type</CardTitle>
          <CardDescription>Choose the type of account that suits your needs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {accountTypes.map((type) => {
              const Icon = type.icon;
              return (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setSelectedType(type.value as any)}
                  className={`
                    relative p-6 rounded-xl border-2 transition-all duration-200 text-left
                    ${selectedType === type.value
                      ? 'border-primary-600 bg-primary-50'
                      : 'border-border hover:border-primary-300'
                    }
                  `}
                >
                  {selectedType === type.value && (
                    <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary-600 flex items-center justify-center">
                      <Plus className="w-3 h-3 text-white" />
                    </div>
                  )}
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 ${
                    type.value === 'SAVINGS' ? 'bg-primary-50 text-primary-700' :
                    type.value === 'CURRENT' ? 'bg-success-50 text-success-700' :
                    'bg-brass-50 text-brass-700'
                  }`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="font-semibold text-text mb-1">{type.label}</h3>
                  <p className="text-sm text-muted">{type.description}</p>
                </button>
              );
            })}
          </div>
          <input type="hidden" {...register('accountType')} value={selectedType} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{canOpenForOthers ? 'Opening balance' : 'Initial Deposit'}</CardTitle>
          <CardDescription>
            {canOpenForOthers
              ? 'A branch-opened account starts at zero'
              : 'Add funds to your new account (optional)'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {canOpenForOthers ? (
            /*
              Not a disabled input — an explanation. A greyed-out field still
              reads as "unlockable", and the reason matters: cash handed over at
              the counter is recorded as a deposit on the new account so it appears
              in the ledger, rather than as an opening balance that appears from
              nowhere.
            */
            <p className="rounded-lg border border-border bg-sunken px-4 py-3 text-sm leading-relaxed text-ink-soft">
              If the customer is handing over cash now, open the account first and then
              record the amount as a deposit. It will appear in their statement and in
              the audit trail; an opening balance would not.
            </p>
          ) : (
            <>
              <div className="relative">
                <Input
                  label="Initial Deposit"
                  type="number"
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  {...register('initialDeposit', { valueAsNumber: true })}
                  error={errors.initialDeposit?.message}
                />
                <span className="absolute right-4 top-[38px] text-muted">INR</span>
              </div>

              {initialDeposit > 0 && (
                <div className="p-4 rounded-lg bg-sunken">
                  <p className="text-sm text-muted">You will deposit:</p>
                  <p className="text-2xl font-semibold text-text">{formatCurrency(initialDeposit)}</p>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {[1000, 5000, 10000, 25000, 50000].map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setValue('initialDeposit', amount)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      initialDeposit === amount
                        ? 'bg-primary-600 text-white'
                        : 'bg-sunken text-ink-soft hover:bg-rule'
                    }`}
                  >
                    {formatCurrency(amount)}
                  </button>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex justify-end gap-3 pt-0">
          <Button type="button" variant="secondary" onClick={() => setValue('initialDeposit', 0)}>
            Reset
          </Button>
          <Button type="submit" form="open-account-form" size="lg" isLoading={isLoading} leftIcon={<Plus className="w-4 h-4" />}>
            {canOpenForOthers ? 'Open account for customer' : 'Open Account'}
          </Button>
        </CardContent>
      </Card>

      <form id="open-account-form" onSubmit={handleSubmit(handleSubmitForm)} className="hidden">
        <input type="hidden" {...register('accountType')} value={selectedType} />
        <input type="hidden" {...register('initialDeposit', { valueAsNumber: true })} />
        <input type="hidden" {...register('currency')} value="INR" />
      </form>
    </div>
  );
}
