import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { IApiResponse } from '@shared/types';
import { getCustomerFromRequest, resolveTargetCustomer } from '../utils/ownership';
import * as paymentService from '../services/paymentService';
import * as auditService from '../services/auditService';
import { ValidationError } from '../middleware/errorHandler';

export const pay = async (req: AuthRequest, res: Response): Promise<void> => {
  /*
   * Resolve the customer the money is being sent *from*.
   *
   * A staff caller paying on someone's behalf (a cashier executing a counter
   * instruction) has no Customer record of their own, so `getCustomerFromRequest`
   * 403'd every one of them -- which made `payment:send:any`, granted only to
   * admin, the one permission in the matrix that could never be exercised.
   * `resolveTargetCustomer` takes the customer from the body for staff and from
   * the session for a customer.
   */
  const customer = await resolveTargetCustomer(req, req.body.customerId);
  const { sourceAccountId, beneficiaryId, amount, note } = req.body;

  const result = await paymentService.payBeneficiary(customer._id.toString(), req.user!._id.toString(), {
    sourceAccountId,
    beneficiaryId,
    amount,
    note,
  });

  await auditService.recordAudit(req, {
    action: 'PAYMENT_SENT',
    entity: 'transaction',
    entityId: result.reference,
    message: `Paid ₹${result.amount.toLocaleString('en-IN')} to ${result.beneficiary.name}`,
    metadata: {
      channel: result.channel,
      beneficiaryId: result.beneficiary.id,
      sourceAccount: result.sourceAccount.accountNumber,
    },
  });

  const response: IApiResponse = {
    success: true,
    message: `₹${result.amount.toLocaleString('en-IN')} sent to ${result.beneficiary.name}`,
    data: { payment: result },
  };
  res.status(201).json(response);
};

/** Preview the rail and arrival time before the customer commits. */
export const previewPayment = async (req: AuthRequest, res: Response): Promise<void> => {
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ValidationError('Enter a valid amount');
  }

  const channel = paymentService.chooseChannel(amount);
  const response: IApiResponse = {
    success: true,
    data: {
      preview: {
        channel,
        arrival:
          channel === 'IMPS' || channel === 'UPI'
            ? 'Instant (within seconds)'
            : channel === 'NEFT'
              ? 'Same working day (typically 2 hours)'
              : 'Same working day (must be before 3:30 PM)',
        fee: 0,
      },
    },
  };
  res.json(response);
};

export const recordIncoming = async (req: AuthRequest, res: Response): Promise<void> => {
  // Staff only (`payment:receive:any`). The target customer's id comes from the
  // body because the teller recording the credit is not the account holder.
  const customer = await resolveTargetCustomer(req, req.body.customerId);
  const { accountId, amount, from, reference, note } = req.body;

  if (!from) throw new ValidationError('Sender name is required');
  if (amount === undefined || amount === null || amount === '') {
    throw new ValidationError('Amount is required');
  }

  const result = await paymentService.recordIncoming(customer._id.toString(), req.user!._id.toString(), {
    accountId,
    amount,
    from,
    reference,
    note,
  });

  await auditService.recordAudit(req, {
    action: 'MONEY_RECEIVED',
    entity: 'transaction',
    entityId: result.transaction.reference,
    message: `Received ₹${amount} from ${from}`,
  });

  const response: IApiResponse = {
    success: true,
    message: 'Payment recorded',
    data: result,
  };
  res.status(201).json(response);
};

export const reversePayment = async (req: AuthRequest, res: Response): Promise<void> => {
  const customer = await getCustomerFromRequest(req);
  const result = await paymentService.reversePayment(
    customer._id.toString(),
    req.user!._id.toString(),
    req.params.transactionId,
    req.body?.reason
  );

  await auditService.recordAudit(req, {
    action: 'PAYMENT_REVERSED',
    entity: 'transaction',
    entityId: result.transaction.reference,
    message: req.body?.reason || 'Reversed by customer',
  });

  const response: IApiResponse = {
    success: true,
    message: 'Payment reversed',
    data: result,
  };
  res.json(response);
};
