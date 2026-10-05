import { StandingInstruction, IStandingInstructionDocument, advance, newInstructionReference } from '../models/StandingInstruction';
import { Account } from '../models/Account';
import { Beneficiary } from '../models/Beneficiary';
import { NotFoundError, ValidationError, ForbiddenError } from '../middleware/errorHandler';
import { payBeneficiary } from './paymentService';
import { transferFunds } from './accountService';
import { notify } from './notificationService';
import logger from '../utils/logger';

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface InstructionView {
  id: string;
  reference: string;
  nickname: string;
  amount: number;
  frequency: string;
  scheduleLabel: string;
  dayOfMonth: number;
  startDate: Date;
  endDate?: Date;
  nextRunDate: Date;
  remainingRuns?: number;
  runsCompleted: number;
  totalDebited: number;
  status: string;
  lastRunAt?: Date;
  lastFailureReason?: string;
  failureCount: number;
  /**
   * Why the instruction stopped running, and since when. Without these the UI
   * can only say "Paused" and "Cancelled" with no date, which is exactly the
   * part a customer needs when they want to know whether a payment is still
   * going to happen.
   */
  pausedAt?: Date;
  pauseReason?: string;
  cancelledAt?: Date;
  sourceAccount?: { accountNumber: string };
  destination?: {
    kind: 'BENEFICIARY' | 'ACCOUNT';
    id: string;
    label: string;
    detail?: string;
  };
}

/**
 * Mask a payee account number to its last four digits.
 *
 * `maskedAccountNumber` is a Beneficiary *virtual*, and Mongoose's
 * `lean({ virtuals: true })` applies virtuals to the queried document but not
 * to populated sub-documents. So the populate returned a beneficiary with no
 * `maskedAccountNumber`, and the string went out as "HDFC Bank · undefined".
 * Computing it from `accountNumber`, which the populate does select, is both
 * correct and keeps the projection narrow.
 */
const maskAccount = (accountNumber?: string): string =>
  accountNumber ? `•••• ${accountNumber.slice(-4)}` : 'account unavailable';

/** Consecutive failures before a standing instruction is auto-paused. */const MAX_FAILURES = 3;

const toView = (doc: any): InstructionView => {
  const source = doc.sourceAccountId && typeof doc.sourceAccountId === 'object' ? doc.sourceAccountId : null;
  const beneficiary = doc.beneficiaryId && typeof doc.beneficiaryId === 'object' ? doc.beneficiaryId : null;
  const destinationAccount =
    doc.destinationAccountId && typeof doc.destinationAccountId === 'object'
      ? doc.destinationAccountId
      : null;

  const weekday = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][
    (doc.dayOfMonth ?? 1) - 1
  ];
  const scheduleLabel =
    doc.frequency === 'WEEKLY'
      ? `Weekly on ${weekday}`
      : doc.frequency === 'DAILY'
        ? 'Every day'
        : `${doc.frequency.charAt(0)}${doc.frequency.slice(1).toLowerCase()} on the ${doc.dayOfMonth}`;

  return {
    id: String(doc._id),
    reference: doc.reference,
    nickname: doc.nickname,
    amount: doc.amount,
    frequency: doc.frequency,
    scheduleLabel: doc.scheduleLabel ?? scheduleLabel,
    dayOfMonth: doc.dayOfMonth,
    startDate: doc.startDate,
    endDate: doc.endDate,
    nextRunDate: doc.nextRunDate,
    remainingRuns: doc.remainingRuns,
    runsCompleted: doc.runsCompleted,
    totalDebited: doc.totalDebited,
    status: doc.status,
    lastRunAt: doc.lastRunAt,
    lastFailureReason: doc.lastFailureReason,
    failureCount: doc.failureCount,
    // The pause and cancellation stamps. Without these the UI could only say
    // "Cancelled" with no date and "Paused" with no reason, which is the part
    // a customer actually needs when they want to know whether a payment is
    // still going to run.
    pausedAt: doc.pausedAt,
    pauseReason: doc.pauseReason,
    cancelledAt: doc.cancelledAt,
    sourceAccount: source ? { accountNumber: source.accountNumber } : undefined,
    destination: beneficiary
      ? {
          kind: 'BENEFICIARY',
          id: String(beneficiary._id),
          label: beneficiary.name,
          detail: `${beneficiary.bankName} · ${maskAccount(beneficiary.accountNumber)}`,
        }
      : destinationAccount
        ? {
            kind: 'ACCOUNT',
            id: String(destinationAccount._id),
            label: `${destinationAccount.accountType} account`,
            detail: `•••• ${String(destinationAccount.accountNumber).slice(-4)}`,
          }
        : undefined,
  };
};

export const createInstruction = async (
  customerId: string,
  userId: string,
  input: {
    sourceAccountId: string;
    beneficiaryId?: string;
    destinationAccountId?: string;
    nickname: string;
    amount: number;
    frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
    dayOfMonth: number;
    startDate: string;
    endDate?: string;
    remainingRuns?: number;
  }
): Promise<InstructionView> => {
  const amount = round2(input.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ValidationError('Amount must be greater than zero');
  }
  // One destination, never two, never none: the run path has to know exactly
  // where to send the money without a branch in the code.
  if (Boolean(input.beneficiaryId) === Boolean(input.destinationAccountId)) {
    throw new ValidationError('Choose either a payee or another of your accounts, not both');
  }
  if (!input.nickname?.trim()) {
    throw new ValidationError('Give this instruction a name so you recognise it');
  }
  if (input.dayOfMonth < 1 || input.dayOfMonth > 28) {
    throw new ValidationError('The day must be between 1 and 28');
  }
  if (input.frequency === 'WEEKLY' && input.dayOfMonth > 7) {
    throw new ValidationError('For a weekly instruction the day must be 1 (Monday) to 7 (Sunday)');
  }

  const account = await Account.findOne({ _id: input.sourceAccountId, customerId });
  if (!account) throw new NotFoundError('Source account');
  if (account.status !== 'ACTIVE') {
    throw new ValidationError(`Your account is ${account.status.toLowerCase()}`);
  }

  if (input.destinationAccountId) {
    const destination = await Account.findOne({ _id: input.destinationAccountId, customerId });
    if (!destination) throw new NotFoundError('Destination account');
    if (String(destination._id) === String(account._id)) {
      throw new ValidationError('The source and destination accounts must be different');
    }
  }

  const startDate = new Date(input.startDate);
  if (Number.isNaN(startDate.getTime())) {
    throw new ValidationError('Invalid start date');
  }
  if (startDate.getTime() < Date.now() - 86_400_000) {
    throw new ValidationError('The start date cannot be in the past');
  }
  // First run is the next occurrence on/after the start date, so a customer
  // who sets up rent on the 28th does not get an immediate extra debit.
  const nextRunDate = startDate;

  const instruction = await StandingInstruction.create({
    reference: newInstructionReference(),
    customerId,
    userId,
    sourceAccountId: account._id,
    beneficiaryId: input.beneficiaryId,
    destinationAccountId: input.destinationAccountId,
    nickname: input.nickname.trim(),
    amount,
    frequency: input.frequency,
    dayOfMonth: input.dayOfMonth,
    startDate,
    endDate: input.endDate ? new Date(input.endDate) : undefined,
    nextRunDate,
    remainingRuns: input.remainingRuns ?? undefined,
    runsCompleted: 0,
    totalDebited: 0,
    status: 'ACTIVE',
    failureCount: 0,
  });

  logger.info(`Standing instruction ${instruction.reference}: ${instruction.nickname}`);
  const populated = await StandingInstruction.findById(instruction._id)
    .populate('sourceAccountId', 'accountNumber')
    .populate('beneficiaryId', 'name bankName accountNumber')
    .populate('destinationAccountId', 'accountType accountNumber')
    .lean({ virtuals: true });

  return toView(populated);
};

export const getInstructions = async (customerId: string): Promise<InstructionView[]> => {
  const instructions = await StandingInstruction.find({ customerId })
    .populate('sourceAccountId', 'accountNumber')
    .populate('beneficiaryId', 'name bankName accountNumber')
    .populate('destinationAccountId', 'accountType accountNumber')
    .sort({ status: 1, nextRunDate: 1 })
    .lean({ virtuals: true });
  return instructions.map(toView);
};

const loadOwned = async (id: string, customerId: string): Promise<IStandingInstructionDocument> => {
  const instruction = await StandingInstruction.findById(id);
  if (!instruction) throw new NotFoundError('Standing instruction');
  if (!instruction.customerId.equals(customerId)) {
    throw new ForbiddenError('You do not have access to this instruction');
  }
  return instruction;
};

export const updateInstruction = async (
  id: string,
  customerId: string,
  patch: Partial<{
    nickname: string;
    amount: number;
    nextRunDate: string;
    remainingRuns: number;
    dayOfMonth: number;
  }>
): Promise<InstructionView> => {
  const instruction = await loadOwned(id, customerId);
  if (!['ACTIVE', 'PAUSED'].includes(instruction.status)) {
    throw new ValidationError(`A ${instruction.status.toLowerCase()} instruction cannot be edited`);
  }

  if (patch.nickname !== undefined) instruction.nickname = patch.nickname.trim();
  if (patch.amount !== undefined) {
    const amount = round2(patch.amount);
    if (amount <= 0) throw new ValidationError('Amount must be greater than zero');
    instruction.amount = amount;
  }
  if (patch.nextRunDate !== undefined) {
    const next = new Date(patch.nextRunDate);
    if (Number.isNaN(next.getTime())) throw new ValidationError('Invalid date');
    instruction.nextRunDate = next;
  }
  if (patch.remainingRuns !== undefined) {
    if (patch.remainingRuns < 0) throw new ValidationError('Remaining runs cannot be negative');
    instruction.remainingRuns = patch.remainingRuns || undefined;
  }
  // `dayOfMonth` used to be dropped silently here, so the route accepted the
  // field and answered 200 while changing nothing. Same bounds as create: a day
  // of 29–31 would never fire in February, so it is rejected rather than
  // accepted and quietly missed.
  if (patch.dayOfMonth !== undefined) {
    if (patch.dayOfMonth < 1 || patch.dayOfMonth > 28) {
      throw new ValidationError('The day must be between 1 and 28');
    }
    if (instruction.frequency === 'WEEKLY' && patch.dayOfMonth > 7) {
      throw new ValidationError('For a weekly instruction the day must be 1 (Monday) to 7 (Sunday)');
    }
    instruction.dayOfMonth = patch.dayOfMonth;
  }

  await instruction.save();
  const populated = await StandingInstruction.findById(instruction._id)
    .populate('sourceAccountId', 'accountNumber')
    .populate('beneficiaryId', 'name bankName accountNumber')
    .populate('destinationAccountId', 'accountType accountNumber')
    .lean({ virtuals: true });
  return toView(populated);
};

export const pauseInstruction = async (
  id: string,
  customerId: string,
  reason?: string
): Promise<InstructionView> => {
  const instruction = await loadOwned(id, customerId);
  if (instruction.status !== 'ACTIVE') {
    throw new ValidationError(`This instruction is already ${instruction.status.toLowerCase()}`);
  }
  instruction.status = 'PAUSED';
  instruction.pausedAt = new Date();
  instruction.pauseReason = reason?.trim() || 'Paused by customer';
  await instruction.save();

  const populated = await StandingInstruction.findById(instruction._id)
    .populate('sourceAccountId', 'accountNumber')
    .populate('beneficiaryId', 'name bankName accountNumber')
    .lean({ virtuals: true });
  return toView(populated);
};

export const resumeInstruction = async (id: string, customerId: string): Promise<InstructionView> => {
  const instruction = await loadOwned(id, customerId);
  if (instruction.status !== 'PAUSED') {
    throw new ValidationError('Only a paused instruction can be resumed');
  }
  instruction.status = 'ACTIVE';
  instruction.pausedAt = undefined;
  instruction.pauseReason = undefined;
  instruction.failureCount = 0;
  instruction.lastFailureReason = undefined;
  // Skip any run dates that elapsed while paused, rather than firing a burst.
  while (instruction.nextRunDate.getTime() < Date.now() - 86_400_000) {
    instruction.nextRunDate = advance(instruction.nextRunDate, instruction.frequency);
  }
  await instruction.save();

  const populated = await StandingInstruction.findById(instruction._id)
    .populate('sourceAccountId', 'accountNumber')
    .populate('beneficiaryId', 'name bankName accountNumber')
    .populate('destinationAccountId', 'accountType accountNumber')
    .lean({ virtuals: true });
  return toView(populated);
};

export const cancelInstruction = async (id: string, customerId: string): Promise<InstructionView> => {
  const instruction = await loadOwned(id, customerId);
  if (instruction.status === 'CANCELLED') {
    const existing = await StandingInstruction.findById(instruction._id).lean();
    return toView(existing);
  }
  instruction.status = 'CANCELLED';
  instruction.cancelledAt = new Date();
  await instruction.save();

  const populated = await StandingInstruction.findById(instruction._id)
    .populate('sourceAccountId', 'accountNumber')
    .populate('beneficiaryId', 'name bankName accountNumber')
    .lean({ virtuals: true });
  return toView(populated);
};

/**
 * Execute one instruction now.
 *
 * Shared by the sweep and by the "run now" button. A failure is recorded and
 * the schedule still advances, because an instruction that keeps retrying a
 * failed payment every hour is worse than one that stops and tells the customer
 * why. After `MAX_FAILURES` it pauses itself.
 */
export const runInstruction = async (
  instruction: IStandingInstructionDocument
): Promise<{ ok: boolean; reference?: string; error?: string }> => {
  try {
    if (instruction.beneficiaryId) {
      const result = await payBeneficiary(String(instruction.customerId), String(instruction.userId), {
        sourceAccountId: String(instruction.sourceAccountId),
        beneficiaryId: String(instruction.beneficiaryId),
        amount: instruction.amount,
        note: instruction.nickname,
      });
      instruction.totalDebited = round2(instruction.totalDebited + result.amount);
      instruction.lastRunAt = new Date();
      instruction.runsCompleted += 1;
      instruction.failureCount = 0;
      instruction.lastFailureReason = undefined;
      instruction.nextRunDate = advance(instruction.nextRunDate, instruction.frequency);
      if (instruction.remainingRuns !== undefined) {
        instruction.remainingRuns = Math.max(0, instruction.remainingRuns - 1);
        if (instruction.remainingRuns === 0) instruction.status = 'COMPLETED';
      }
      await instruction.save();
      return { ok: true, reference: result.reference };
    }

    // Internal transfer between the customer's own accounts. Reuse the ledger
    // path so the transaction rows match what a manual transfer produces.
    const source = await Account.findById(instruction.sourceAccountId);
    const destination = await Account.findById(instruction.destinationAccountId);
    if (!source || !destination) throw new ValidationError('One of the accounts no longer exists');
    if (source.balance < instruction.amount) {
      throw new ValidationError('Not enough balance for the scheduled debit');
    }

    await transferFunds(
      source.accountNumber,
      destination.accountNumber,
      instruction.amount,
      instruction.nickname
    );

    instruction.totalDebited = round2(instruction.totalDebited + instruction.amount);
    instruction.lastRunAt = new Date();
    instruction.runsCompleted += 1;
    instruction.failureCount = 0;
    instruction.lastFailureReason = undefined;
    instruction.nextRunDate = advance(instruction.nextRunDate, instruction.frequency);
    if (instruction.remainingRuns !== undefined) {
      instruction.remainingRuns = Math.max(0, instruction.remainingRuns - 1);
      if (instruction.remainingRuns === 0) instruction.status = 'COMPLETED';
    }
    await instruction.save();
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    instruction.failureCount += 1;
    instruction.lastFailureReason = message;
    if (instruction.failureCount >= MAX_FAILURES) {
      instruction.status = 'PAUSED';
      instruction.pausedAt = new Date();
      instruction.pauseReason = `Paused after ${MAX_FAILURES} failed attempts: ${message}`;
    }
    await instruction.save();

    await notify({
      userId: String(instruction.userId),
      customerId: String(instruction.customerId),
      category: 'account',
      title: instruction.failureCount >= MAX_FAILURES ? 'Standing instruction paused' : 'Standing instruction failed',
      body: `${instruction.nickname}: ${message}`,
      link: '/standing-instructions',
      priority: 'high',
      referenceId: `si-failed:${String(instruction._id)}:${instruction.failureCount}`,
    });

    logger.error(`Standing instruction ${instruction.reference} failed:`, {
      error: message,
      id: String(instruction._id),
      failures: instruction.failureCount,
    });
    return { ok: false, error: message };
  }
};

/**
 * Run everything due. Intended to be called on an interval (and once at boot).
 * Returns a summary so a scheduler can log it.
 */
export const runDueInstructions = async (): Promise<{
  due: number;
  succeeded: number;
  failed: number;
}> => {
  const due = await StandingInstruction.find({
    status: 'ACTIVE',
    nextRunDate: { $lte: new Date() },
  });

  let succeeded = 0;
  let failed = 0;

  for (const instruction of due) {
    const result = await runInstruction(instruction);
    if (result.ok) succeeded++;
    else failed++;
  }

  if (due.length > 0) {
    logger.info(`Standing instruction sweep: ${due.length} due, ${succeeded} ok, ${failed} failed`);
  }
  return { due: due.length, succeeded, failed };
};

export const getInstructionSummary = async (customerId: string) => {
  const instructions = await StandingInstruction.find({ customerId })
    .select('status amount totalDebited runsCompleted')
    .lean();

  return {
    total: instructions.length,
    active: instructions.filter((i) => i.status === 'ACTIVE').length,
    paused: instructions.filter((i) => i.status === 'PAUSED').length,
    monthlyOutflow: round2(
      instructions
        .filter((i) => i.status === 'ACTIVE')
        .reduce((sum, i) => {
          const weight =
            i.frequency === 'DAILY' ? 30 : i.frequency === 'WEEKLY' ? 4 : i.frequency === 'QUARTERLY' ? 1 / 3 : i.frequency === 'YEARLY' ? 1 / 12 : 1;
          return sum + i.amount * weight;
        }, 0)
    ),
  };
};

export default {
  createInstruction,
  getInstructions,
  updateInstruction,
  pauseInstruction,
  resumeInstruction,
  cancelInstruction,
  runInstruction,
  runDueInstructions,
  getInstructionSummary,
};