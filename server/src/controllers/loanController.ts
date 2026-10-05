import { Response } from 'express';
import { Account } from '../models/Account';
import { Customer } from '../models/Customer';
import { applyLoan, getLoanById, getLoansByAccount, getAllLoans, approveLoan, disburseLoan, repayLoan, calculateLoanInterest, getLoanPayments, getOverdueLoans } from '../services/loanService';
import { AppError, NotFoundError, ValidationError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { IUserDocument } from '../models/User';
import logger from '../utils/logger';
import { IApiResponse } from '@shared/types';
import { getCustomerForUser, visibleAccountIds } from '../utils/ownership';
import { isStaffRole } from '../config/permissions';

export const applyForLoan = async (req: AuthRequest, res: Response): Promise<void> => {
  const { accountNumber, principalAmount, interestRate, termMonths } = req.body;
  const user = req.user!;

  const account = await Account.findOne({ accountNumber: accountNumber.toUpperCase() });
  if (!account) {
    throw new NotFoundError('Account');
  }

  /*
   * A customer may only borrow against their own account.
   *
   * This previously resolved the *caller's* Customer record unconditionally, so
   * a manager or loan officer -- both of whom hold `loan:apply:any` -- got
   * "Account does not belong to you", making that permission unusable by anyone.
   * The customer branch is now what it always should have been; staff fall
   * through to the account-status check below.
   */
  if (!isStaffRole(user.role)) {
    const customer = await Customer.findOne({ userId: user._id });
    if (!customer || account.customerId.toString() !== customer._id.toString()) {
      throw new ValidationError('Account does not belong to you');
    }
  }

  if (account.status !== 'ACTIVE') {
    throw new ValidationError('Account must be active to apply for a loan');
  }

  const loan = await applyLoan(accountNumber, principalAmount, interestRate, termMonths);

  const response: IApiResponse = {
    success: true,
    message: 'Loan application submitted successfully',
    data: { loan },
  };

  res.status(201).json(response);
};

/**
 * Ensure a customer may read a loan.
 *
 * A loan hangs off an *account*, and the account off a customer, so the loan's
 * accountId has to be resolved to its customerId before comparing. Comparing
 * loan.accountId straight against customer._id never matched, which rejected
 * customers' own loans with "Access denied".
 *
 * Admins and managers bypass the check (the routes already gate those).
 */
const assertOwnsLoan = async (user: IUserDocument, accountId: string): Promise<void> => {
  if (user.role !== 'customer') return;

  const customer = await Customer.findOne({ userId: user._id });
  if (!customer) return;

  const account = await Account.findById(accountId).select('customerId');
  if (!account || account.customerId.toString() !== customer._id.toString()) {
    throw new ValidationError('Access denied');
  }
};

export const getLoan = async (req: AuthRequest, res: Response): Promise<void> => {
  const { loanId } = req.params;

  const loan = await getLoanById(loanId);
  if (!loan) {
    throw new NotFoundError('Loan');
  }

  await assertOwnsLoan(req.user!, loan.accountId);

  const payments = await getLoanPayments(loanId);

  const response: IApiResponse = {
    success: true,
    data: { loan, payments },
  };

  res.json(response);
};

export const getMyLoans = async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user!;
  // Throws 403 for staff, who have no Customer record. Returning
  // `{ loans: [] }` here read as "this person has no loans", which is a
  // different and wrong answer -- a manager looking at their own loans is
  // looking at the wrong endpoint entirely.
  const customer = await getCustomerForUser(user._id.toString());

  const accounts = await Account.find({ customerId: customer._id }).select('_id');

  // Aggregate across every account the customer holds -- using only the first
  // one silently hid loans taken against their other accounts.
  const accountIds = accounts.map((a) => a._id.toString());
  const loans = (
    await Promise.all(accountIds.map((id) => getLoansByAccount(id)))
  ).flat();

  const response: IApiResponse = {
    success: true,
    data: { loans },
  };

  res.json(response);
};

export const getAllLoansController = async (req: AuthRequest, res: Response): Promise<void> => {
  const { page = 1, limit = 20, status } = req.query;

  // Branch scope, expressed as the accounts this caller may see.
  const accountIds = (await visibleAccountIds(req.user!)).map(String);

  const result = await getAllLoans(
    parseInt(page as string, 10),
    parseInt(limit as string, 10),
    { status: status as string, accountIds }
  );

  const response: IApiResponse = {
    success: true,
    // Wrapped in `{ loans }` to match ApiResponse in shared/types and the
    // shape api.getAllLoans() reads on the client.
    data: { loans: result.loans },
    meta: {
      page: parseInt(page as string, 10),
      limit: parseInt(limit as string, 10),
      total: result.total,
      totalPages: result.totalPages,
    },
  };

  res.json(response);
};

export const approveLoanController = async (req: AuthRequest, res: Response): Promise<void> => {
  const { loanId } = req.params;

  const loan = await approveLoan(loanId);

  const response: IApiResponse = {
    success: true,
    message: 'Loan approved successfully',
    data: { loan },
  };

  res.json(response);
};

export const disburseLoanController = async (req: AuthRequest, res: Response): Promise<void> => {
  const { loanId } = req.params;

  const loan = await disburseLoan(loanId);

  const response: IApiResponse = {
    success: true,
    message: 'Loan disbursed successfully',
    data: { loan },
  };

  res.json(response);
};

export const repayLoanController = async (req: AuthRequest, res: Response): Promise<void> => {
  // The loan id is the path segment; the amount and the chosen paying account
  // come from the body.
  const { loanId } = req.params;
  const { amount, fromAccountId } = req.body;

  const existing = await getLoanById(loanId);
  if (!existing) {
    throw new NotFoundError('Loan');
  }
  await assertOwnsLoan(req.user!, existing.accountId);

  // The borrower chooses which of their own accounts pays. Ownership of that
  // account is re-checked in the service against the loan's own customer — the
  // field comes from the client, so trusting it here would be the whole bug.
  const loan = await repayLoan(loanId, amount, fromAccountId);

  const response: IApiResponse = {
    success: true,
    message: 'Loan repayment completed successfully',
    data: { loan },
  };

  res.json(response);
};

export const calculateLoanInterestController = async (req: AuthRequest, res: Response): Promise<void> => {
  const { loanId, fromDate, toDate } = req.body;

  const existing = await getLoanById(loanId);
  if (!existing) {
    throw new NotFoundError('Loan');
  }
  await assertOwnsLoan(req.user!, existing.accountId);

  const interest = await calculateLoanInterest(loanId, new Date(fromDate), new Date(toDate));

  const response: IApiResponse = {
    success: true,
    data: { interest },
  };

  res.json(response);
};

export const getLoanPaymentsController = async (req: AuthRequest, res: Response): Promise<void> => {
  const { loanId } = req.params;

  const loan = await getLoanById(loanId);
  if (!loan) {
    throw new NotFoundError('Loan');
  }
  await assertOwnsLoan(req.user!, loan.accountId);

  const payments = await getLoanPayments(loanId);

  const response: IApiResponse = {
    success: true,
    data: { payments },
  };

  res.json(response);
};

export const getOverdueLoansController = async (req: AuthRequest, res: Response): Promise<void> => {
  // Collections do not cross branches: the overdue list is scoped to the
  // accounts the caller can see, which for branch staff is their own branch.
  const accountIds = (await visibleAccountIds(req.user!)).map(String);
  const loans = await getOverdueLoans(accountIds);

  const response: IApiResponse = {
    success: true,
    data: { loans },
  };

  res.json(response);
};