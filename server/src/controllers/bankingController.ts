import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { IApiResponse } from '@shared/types';
import { getCustomerFromRequest, resolveTargetCustomer } from '../utils/ownership';
import * as depositService from '../services/depositService';
import * as instructionService from '../services/instructionService';
import * as nomineeService from '../services/nomineeService';
import * as kycService from '../services/kycService';
import * as auditService from '../services/auditService';
import * as notificationService from '../services/notificationService';
import { StandingInstruction } from '../models/StandingInstruction';

// ---------------------------------------------------------------- deposits

export const quoteDeposit = async (req: AuthRequest, res: Response): Promise<void> => {
  // This is a GET, and a GET has no body. Reading only `req.body` made the
  // endpoint answer 400 to every caller, including the app's own quote box.
  // Merged so a POST client works too.
  const input = { ...(req.query as Record<string, unknown>), ...(req.body ?? {}) };
  const principal = Number(input.principal);
  const termMonths = Number(input.termMonths);
  if (!Number.isFinite(principal) || principal <= 0) {
    res.status(400).json({ success: false, error: 'Enter an amount' });
    return;
  }
  if (!Number.isFinite(termMonths) || termMonths <= 0) {
    res.status(400).json({ success: false, error: 'Choose a term' });
    return;
  }
  const quote = depositService.quote(principal, termMonths);
  res.json({ success: true, data: { quote } });
};

export const listDeposits = async (req: AuthRequest, res: Response): Promise<void> => {
  /*
   * `resolveTargetCustomer`, not `getCustomerFromRequest`.
   *
   * Four staff roles hold `deposit:read:any`, and resolving the *caller's*
   * Customer record threw ForbiddenError for every one of them — so the grant was
   * dead and the feature was customer-only despite the matrix. A customer
   * resolves to their own record whatever they pass; staff must name a
   * `customerId`, and are refused without one rather than defaulting to an
   * arbitrary customer.
   */
  const customer = await resolveTargetCustomer(req, req.query.customerId as string | undefined);
  const [deposits, summary] = await Promise.all([
    depositService.getDepositsForCustomer(customer._id.toString()),
    depositService.getDepositSummary(customer._id.toString()),
  ]);
  const response: IApiResponse = { success: true, data: { deposits, summary } };
  res.json(response);
};

export const openDeposit = async (req: AuthRequest, res: Response): Promise<void> => {
  const customer = await getCustomerFromRequest(req);
  const { sourceAccountId, principal, termMonths, interestPayoutMode } = req.body;

  const deposit = await depositService.openDeposit(customer._id.toString(), req.user!._id.toString(), {
    sourceAccountId,
    principal,
    termMonths: Number(termMonths),
    interestPayoutMode,
  });

  await auditService.recordAudit(req, {
    action: 'DEPOSIT_OPENED',
    entity: 'fixed_deposit',
    entityId: deposit.reference,
    message: `Fixed deposit of ₹${principal} for ${termMonths} months`,
    metadata: { principal, termMonths, rate: deposit.interestRate },
  });

  await kycService_notifyDeposit(customer._id.toString(), req.user!._id.toString(), deposit);

  const response: IApiResponse = {
    success: true,
    message: `₹${deposit.maturityAmount.toLocaleString('en-IN')} will be credited on maturity`,
    data: { deposit },
  };
  res.status(201).json(response);
};

const kycService_notifyDeposit = async (customerId: string, userId: string, deposit: any) => {
  await notificationService.notify({
    userId,
    customerId,
    category: 'account',
    title: 'Fixed deposit opened',
    body: `₹${deposit.principal.toLocaleString('en-IN')} for ${deposit.termMonths} months at ${deposit.interestRate}%`,
    link: '/deposits',
    referenceId: `deposit-opened:${deposit.reference}`,
  });
};

export const getDeposit = async (req: AuthRequest, res: Response): Promise<void> => {
  const customer = await getCustomerFromRequest(req);
  const deposit = await depositService.getDepositById(req.params.depositId, customer._id.toString());
  const response: IApiResponse = { success: true, data: { deposit } };
  res.json(response);
};

export const closeDeposit = async (req: AuthRequest, res: Response): Promise<void> => {
  const customer = await getCustomerFromRequest(req);
  const deposit = await depositService.closeDepositEarly(
    req.params.depositId,
    customer._id.toString(),
    req.body?.reason
  );

  await auditService.recordAudit(req, {
    action: 'DEPOSIT_CLOSED_EARLY',
    entity: 'fixed_deposit',
    entityId: deposit.reference,
    message: `Closed early with a ₹${deposit.penaltyAmount ?? 0} penalty`,
  });

  const response: IApiResponse = {
    success: true,
    message: 'Deposit closed. Interest was paid at the penalty rate.',
    data: { deposit },
  };
  res.json(response);
};

/** Staff action: run the maturity sweep on demand. */
export const runMaturities = async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await depositService.processMaturities();
  await auditService.recordAudit(req, {
    action: 'MATURITY_SWEEP',
    entity: 'fixed_deposit',
    message: `${result.matured} matured, ${result.failed} failed`,
  });
  const response: IApiResponse = { success: true, data: result };
  res.json(response);
};

// --------------------------------------------------- standing instructions

export const listInstructions = async (req: AuthRequest, res: Response): Promise<void> => {
  const customer = await getCustomerFromRequest(req);
  const [instructions, summary] = await Promise.all([
    instructionService.getInstructions(customer._id.toString()),
    instructionService.getInstructionSummary(customer._id.toString()),
  ]);
  const response: IApiResponse = { success: true, data: { instructions, summary } };
  res.json(response);
};

export const createInstruction = async (req: AuthRequest, res: Response): Promise<void> => {
  const customer = await getCustomerFromRequest(req);
  const instruction = await instructionService.createInstruction(
    customer._id.toString(),
    req.user!._id.toString(),
    req.body
  );

  await auditService.recordAudit(req, {
    action: 'INSTRUCTION_CREATED',
    entity: 'standing_instruction',
    entityId: instruction.reference,
    message: `${instruction.nickname}: ₹${instruction.amount} ${instruction.frequency.toLowerCase()}`,
  });

  const response: IApiResponse = {
    success: true,
    message: 'Standing instruction set up',
    data: { instruction },
  };
  res.status(201).json(response);
};

export const updateInstruction = async (req: AuthRequest, res: Response): Promise<void> => {
  const customer = await getCustomerFromRequest(req);
  const instruction = await instructionService.updateInstruction(
    req.params.instructionId,
    customer._id.toString(),
    req.body || {}
  );
  const response: IApiResponse = { success: true, data: { instruction } };
  res.json(response);
};

export const pauseInstruction = async (req: AuthRequest, res: Response): Promise<void> => {
  const customer = await getCustomerFromRequest(req);
  const instruction = await instructionService.pauseInstruction(
    req.params.instructionId,
    customer._id.toString(),
    req.body?.reason
  );
  const response: IApiResponse = { success: true, data: { instruction } };
  res.json(response);
};

export const resumeInstruction = async (req: AuthRequest, res: Response): Promise<void> => {
  const customer = await getCustomerFromRequest(req);
  const instruction = await instructionService.resumeInstruction(
    req.params.instructionId,
    customer._id.toString()
  );
  const response: IApiResponse = { success: true, data: { instruction } };
  res.json(response);
};

export const cancelInstruction = async (req: AuthRequest, res: Response): Promise<void> => {
  const customer = await getCustomerFromRequest(req);
  const instruction = await instructionService.cancelInstruction(
    req.params.instructionId,
    customer._id.toString()
  );
  await auditService.recordAudit(req, {
    action: 'INSTRUCTION_CANCELLED',
    entity: 'standing_instruction',
    entityId: instruction.reference,
  });
  const response: IApiResponse = { success: true, data: { instruction } };
  res.json(response);
};

/** "Run it now" — the same code path the scheduled sweep uses. */
export const runInstructionNow = async (req: AuthRequest, res: Response): Promise<void> => {
  const customer = await getCustomerFromRequest(req);
  const instructions = await instructionService.getInstructions(customer._id.toString());
  const target = instructions.find((i) => i.id === req.params.instructionId);
  if (!target) {
    res.status(404).json({ success: false, error: 'Standing instruction not found' });
    return;
  }

  const doc = await StandingInstruction.findById(target.id);
  if (!doc) {
    res.status(404).json({ success: false, error: 'Standing instruction not found' });
    return;
  }

  const result = await instructionService.runInstruction(doc);
  if (!result.ok) {
    res.status(400).json({ success: false, error: result.error });
    return;
  }

  const refreshed = await instructionService.getInstructions(customer._id.toString());
  const response: IApiResponse = {
    success: true,
    message: 'Payment made',
    data: { instruction: refreshed.find((i) => i.id === target.id) },
  };
  res.json(response);
};

/**
 * Run the customer's own due instructions immediately.
 *
 * In production this is the scheduler's job. Exposing it here means a customer
 * (or a reviewer demonstrating the app) can trigger their own instructions
 * without waiting for the next tick, and it can never touch anyone else's.
 */
export const runMyDueInstructions = async (req: AuthRequest, res: Response): Promise<void> => {
  const customer = await getCustomerFromRequest(req);

  const due = await StandingInstruction.find({
    customerId: customer._id,
    status: 'ACTIVE',
    nextRunDate: { $lte: new Date() },
  });

  let succeeded = 0;
  const failures: string[] = [];
  for (const doc of due) {
    const result = await instructionService.runInstruction(doc);
    if (result.ok) succeeded++;
    else if (result.error) failures.push(result.error);
  }

  await auditService.recordAudit(req, {
    action: 'INSTRUCTIONS_RUN',
    entity: 'standing_instruction',
    message: `${due.length} due, ${succeeded} succeeded`,
  });

  const response: IApiResponse = {
    success: true,
    message: due.length === 0
      ? 'Nothing is due right now'
      : `${succeeded} of ${due.length} payments made`,
    data: { due: due.length, succeeded, failures },
  };
  res.json(response);
};

// -------------------------------------------------------------- nominees

export const listNominees = async (req: AuthRequest, res: Response): Promise<void> => {
  const customer = await getCustomerFromRequest(req);
  const nominees = await nomineeService.getNominees(customer._id.toString());
  const response: IApiResponse = { success: true, data: { nominees } };
  res.json(response);
};

export const registerNominees = async (req: AuthRequest, res: Response): Promise<void> => {
  const customer = await getCustomerFromRequest(req);
  const nominees = await nomineeService.registerNominees(
    customer._id.toString(),
    req.user!._id.toString(),
    req.body
  );

  await auditService.recordAudit(req, {
    action: 'NOMINATION_REGISTERED',
    entity: 'nominee',
    message: `${nominees.length} nominee(s) registered`,
  });

  const response: IApiResponse = {
    success: true,
    message: 'Nomination registered',
    data: { nominees },
  };
  res.json(response);
};

export const cancelNominees = async (req: AuthRequest, res: Response): Promise<void> => {
  const customer = await getCustomerFromRequest(req);
  const result = await nomineeService.cancelNominees(
    customer._id.toString(),
    req.body?.reason
  );
  await auditService.recordAudit(req, {
    action: 'NOMINATION_CANCELLED',
    entity: 'nominee',
    message: `${result.cancelled} nomination(s) cancelled`,
  });
  const response: IApiResponse = { success: true, data: result };
  res.json(response);
};

// -------------------------------------------------------------------- KYC

export const myKyc = async (req: AuthRequest, res: Response): Promise<void> => {
  const customer = await getCustomerFromRequest(req);
  const [latest, history] = await Promise.all([
    kycService.getLatestKyc(customer._id.toString()),
    kycService.getKycHistory(customer._id.toString()),
  ]);

  const response: IApiResponse = {
    success: true,
    data: {
      latest,
      history,
      // The denormalised status on the Customer record, which is what the rest
      // of the app reads to decide whether limits apply.
      kycStatus: customer.kycStatus,
      documents: customer.kycDocuments,
    },
  };
  res.json(response);
};

export const submitKyc = async (req: AuthRequest, res: Response): Promise<void> => {
  const customer = await getCustomerFromRequest(req);
  const submission = await kycService.submitKyc(
    customer._id.toString(),
    req.user!._id.toString(),
    req.body
  );

  await auditService.recordAudit(req, {
    action: 'KYC_SUBMITTED',
    entity: 'kyc',
    entityId: submission.reference,
    // The declared documents are identity data, so only their types are logged.
    metadata: { documentTypes: submission.documents.map((d) => d.type) },
  });

  const response: IApiResponse = {
    success: true,
    message: 'Submitted for review. We will contact you if anything is missing.',
    data: { submission },
  };
  res.status(201).json(response);
};

export const kycQueue = async (req: AuthRequest, res: Response): Promise<void> => {
  const { page = 1, limit = 20, status } = req.query;
  const pageNum = parseInt(page as string, 10);
  const limitNum = parseInt(limit as string, 10);

  const [result, counts] = await Promise.all([
    kycService.getReviewQueue({
      page: pageNum,
      limit: limitNum,
      status: status as string,
    }),
    kycService.getQueueCounts(),
  ]);

  const response: IApiResponse = {
    success: true,
    // Counts are the full-population breakdown even when `status` narrows the
    // list, so the tab badges stay accurate while a reviewer is inside a filter.
    data: { submissions: result.submissions, counts },
    meta: { page: pageNum, limit: limitNum, total: result.total, totalPages: result.totalPages },
  };
  res.json(response);
};

export const reviewKyc = async (req: AuthRequest, res: Response): Promise<void> => {
  const { decision, notes, reasons, riskLevel } = req.body;
  const reviewer = {
    id: req.user!._id.toString(),
    name: `${req.user!.firstName} ${req.user!.lastName}`,
  };

  const submission =
    decision === 'APPROVE'
      ? await kycService.approveKyc(req.params.kycId, reviewer, { notes, riskLevel })
      : decision === 'REJECT'
        ? await kycService.rejectKyc(req.params.kycId, reviewer, { reasons: reasons ?? [], notes })
        : null;

  if (!submission) {
    res.status(400).json({ success: false, error: 'Decision must be APPROVE or REJECT' });
    return;
  }

  await auditService.recordAudit(req, {
    action: `KYC_${decision === 'APPROVE' ? 'APPROVED' : 'REJECTED'}`,
    entity: 'kyc',
    entityId: submission.reference,
    message: notes || (decision === 'REJECT' ? (reasons ?? []).join('; ') : 'Identity verified'),
  });

  const response: IApiResponse = {
    success: true,
    message: decision === 'APPROVE' ? 'KYC approved' : 'KYC rejected',
    data: { submission },
  };
  res.json(response);
};
