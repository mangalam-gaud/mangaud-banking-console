import { Response } from 'express';
import { Customer } from '../models/Customer';
import { Account } from '../models/Account';
import { openAccount, getAccountByNumber, getAccountById, getAccountsByCustomer, getAllAccounts, updateAccountBalance, transferFunds, getAccountBalance, closeAccount, calculateSavingsInterest, applySavingsInterest, setAccountFrozen } from '../services/accountService';
import { AppError, NotFoundError, ValidationError, ForbiddenError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import {
  loadAccountForUser,
  getCustomerFromRequest,
  branchScope,
  resolveTargetCustomer,
} from '../utils/ownership';
import { recordAudit } from '../services/auditService';
import { notifyCredit, notifyDebit } from '../services/notificationService';
import logger from '../utils/logger';
import { isStaffRole } from '../config/permissions';
import { IApiResponse } from '@shared/types';

export const createAccount = async (req: AuthRequest, res: Response): Promise<void> => {
  const { accountType, initialDeposit = 0, currency = 'INR', customerId } = req.body;
  const user = req.user!;
  const staff = isStaffRole(user.role);

  let customer: any;

  if (staff) {
    /*
      The counter workflow: open an account for a customer the branch serves.

      There is no "default to the first customer" path, and there is no silent
      fallback to the caller's own record — a teller who forgets the field gets an
      error naming the field, because the alternative would quietly open an
      account against whichever customer happened to be first in the database.
     */
    customer = await resolveTargetCustomer(req, customerId);

    // Branch scoping, the same rule as everywhere else a staff member reads a
    // customer: BLR001 opens for BLR001, and gets a 403 (not a 404) for another
    // branch, because the caller is the wrong kind of operator rather than the
    // customer being missing.
    const scope = branchScope(user);
    if (scope && String(customer.branchCode ?? '').toUpperCase() !== scope) {
      throw new ForbiddenError(
        `That customer is served by another branch (${customer.branchCode ?? 'unknown'})`
      );
    }

    if (Number(initialDeposit) !== 0) {
      /*
        A counter-opened account must start at zero.

        `initialDeposit` is money the customer hands over, and on the self-service
        path it is a transfer from an account they already hold. Neither is true
        for a branch-opened account: the cash has not been counted into anything,
        and letting `initialDeposit` through here would let a teller create a
        balance out of nothing — the same class of bug as `payment:receive:own`,
        which was a money printer and was removed for exactly this reason.

        When cash is actually tendered, the teller records it as a deposit on the
        new account, which is auditable and appears in the ledger.
      */
      throw new ValidationError(
        'A branch-opened account must start at zero balance. Record any opening cash as a deposit.'
      );
    }
} else {
    /*
      A customer opening their own account.

      `customerId` is ignored for a customer — they only ever open for themselves
      — but it used to be ignored *silently*. Passing somebody else's id got a 201
      and an account on the caller's own record, which reads as "it worked" while
      doing nothing they asked for. An explicit refusal says what happened.
    */
    if (customerId) {
      const mine = await Customer.findOne({ userId: user._id }).select('_id').lean();
      if (!mine || String(mine._id) !== String(customerId)) {
        throw new ForbiddenError('You can only open an account for yourself');
      }
    }

    customer = await Customer.findOne({ userId: user._id });
    if (!customer) {
      customer = await Customer.create({
        userId: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        address: 'Address not provided',
      });
    }
  }

  const account = await openAccount(customer._id.toString(), accountType, initialDeposit, currency);

  await recordAudit(req, {
    action: 'ACCOUNT_OPENED',
    entity: 'account',
    entityId: String(account._id),
    message: staff
      ? `Opened ${account.accountNumber} for ${customer.firstName} ${customer.lastName}`
      : `Opened ${account.accountNumber}`,
    metadata: staff ? { onBehalfOf: customerId } : undefined,
  });

  const response: IApiResponse = {
    success: true,
    message: staff
      ? `Account opened for ${customer.firstName} ${customer.lastName}`
      : 'Account created successfully',
    data: { account },
  };

  res.status(201).json(response);
};

export const getAccount = async (req: AuthRequest, res: Response): Promise<void> => {
  const { accountNumber } = req.params;

  // Ownership check: without it, any logged-in user could read any account by
  // guessing its number.
  const account = await loadAccountForUser(accountNumber, req.user!);

  const response: IApiResponse = {
    success: true,
    data: {
      account: {
        id: String(account._id),
        _id: String(account._id),
customerId: account.customerId?._id?.toString() ?? account.customerId?.toString(),
        // The branch this account is served by. Omitted here it was invisible on
        // the account detail page and in every response built this way, so a
        // teller could not see which branch an account belonged to — the one piece
        // of information that explains why they can or cannot act on it.
        branchCode: account.branchCode,
        accountNumber: account.accountNumber,
        accountType: account.accountType,
        balance: account.balance,
        interestRate: account.interestRate,
        status: account.status,
        currency: account.currency,
        openedAt: account.openedAt,
        customer:
          account.customerId && typeof account.customerId === 'object'
            ? {
                firstName: account.customerId.firstName,
                lastName: account.customerId.lastName,
                email: account.customerId.email,
                phone: account.customerId.phone,
              }
            : undefined,
      },
    },
  };

  res.json(response);
};

export const getMyAccounts = async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user!;

  const customer = await Customer.findOne({ userId: user._id });
  if (!customer) {
    const response: IApiResponse = {
      success: true,
      data: { accounts: [] },
    };
    res.json(response);
    return;
  }

  const accounts = await getAccountsByCustomer(customer._id.toString());

  const response: IApiResponse = {
    success: true,
    data: { accounts },
  };

  res.json(response);
};

export const getAllAccountsController = async (req: AuthRequest, res: Response): Promise<void> => {
  const { page = 1, limit = 20, status, accountType } = req.query;

  /*
    The caller's branch scope wins over anything in the query string.
  `getAllAccounts` intersects the two, but it is the *controller* that decides
  what the caller may ask for: a branch operator's scope is not negotiable by a
  request parameter. Passing the scope in rather than letting the service work
  it out keeps "who is asking" out of the service layer, where it cannot be
  checked at all.
  */
  const scope = branchScope(req.user!);

  const result = await getAllAccounts(
    parseInt(page as string, 10),
    parseInt(limit as string, 10),
    { status: status as string, accountType: accountType as string, branchCode: scope ?? undefined }
  );

  if (scope) {
    // Say so, so an empty list is explicable rather than mysterious.
    logger.info(`Account list scoped to branch ${scope} for ${req.user!.email}`);
  }

  const response: IApiResponse = {
    success: true,
    // Wrapped in `{ accounts }` to match ApiResponse in shared/types and the
    // shape api.getAllAccounts() reads on the client. Returning a bare array
    // made the client read `.accounts` off an array and always get undefined.
    data: { accounts: result.accounts },
    meta: {
      page: parseInt(page as string, 10),
      limit: parseInt(limit as string, 10),
      total: result.total,
      totalPages: result.totalPages,
    },
  };

  res.json(response);
};

export const deposit = async (req: AuthRequest, res: Response): Promise<void> => {
  const { accountNumber, amount, description } = req.body;

  const owned = await loadAccountForUser(accountNumber, req.user!);
  const account = await updateAccountBalance(
    String(owned._id),
    amount,
    'DEPOSIT',
    description || 'Cash deposit'
  );

  await recordAudit(req, {
    action: 'ACCOUNT_DEPOSIT',
    entity: 'account',
    entityId: account.id,
    message: `Deposited into ${account.accountNumber}`,
    metadata: { amount },
  });

  await notifyCredit({
    userId: req.user!._id.toString(),
    amount,
    accountNumber: account.accountNumber,
    reference: account.accountNumber,
    counterparty: description || 'Cash deposit',
  });

  const response: IApiResponse = {
    success: true,
    message: 'Deposit completed successfully',
    data: { account },
  };

  res.json(response);
};

export const withdraw = async (req: AuthRequest, res: Response): Promise<void> => {
  const { accountNumber, amount, description } = req.body;

  const owned = await loadAccountForUser(accountNumber, req.user!);
  const account = await updateAccountBalance(
    String(owned._id),
    -amount,
    'WITHDRAWAL',
    description || 'Cash withdrawal'
  );

  await recordAudit(req, {
    action: 'ACCOUNT_WITHDRAWAL',
    entity: 'account',
    entityId: account.id,
    message: `Withdrew from ${account.accountNumber}`,
    metadata: { amount },
  });

  const response: IApiResponse = {
    success: true,
    message: 'Withdrawal completed successfully',
    data: { account },
  };

  res.json(response);
};

export const transfer = async (req: AuthRequest, res: Response): Promise<void> => {
  const { sourceAccountNumber, destinationAccountNumber, amount, description } = req.body;

  // Both sides of a transfer are checked: a customer must own the account the
  // money leaves, and only staff may move money into an arbitrary account.
  await loadAccountForUser(sourceAccountNumber, req.user!);
  if (req.user!.role !== 'admin' && req.user!.role !== 'manager') {
    await loadAccountForUser(destinationAccountNumber, req.user!);
  }

  const { source, destination } = await transferFunds(
    sourceAccountNumber,
    destinationAccountNumber,
    amount,
    description
  );

  await recordAudit(req, {
    action: 'ACCOUNT_TRANSFER',
    entity: 'account',
    entityId: source.id,
    message: `Transferred to ${destination.accountNumber}`,
    metadata: { amount, destination: destination.accountNumber },
  });

  const response: IApiResponse = {
    success: true,
    message: 'Transfer completed successfully',
    data: { source, destination },
  };

  res.json(response);
};

export const checkBalance = async (req: AuthRequest, res: Response): Promise<void> => {
  const { accountNumber } = req.params;

  const account = await loadAccountForUser(accountNumber, req.user!);

  const response: IApiResponse = {
    success: true,
    data: { balance: account.balance, accountNumber: account.accountNumber, status: account.status },
  };

  res.json(response);
};

export const calculateInterest = async (req: AuthRequest, res: Response): Promise<void> => {
  const { accountNumber, fromDate, toDate } = req.body;

  await loadAccountForUser(accountNumber, req.user!);
  const interest = await calculateSavingsInterest(accountNumber, new Date(fromDate), new Date(toDate));

  const response: IApiResponse = {
    success: true,
    data: { interest },
  };

  res.json(response);
};

export const applyInterest = async (req: AuthRequest, res: Response): Promise<void> => {
  const { accountNumber, fromDate, toDate } = req.body;

  await loadAccountForUser(accountNumber, req.user!);
  const interest = await applySavingsInterest(accountNumber, new Date(fromDate), new Date(toDate));

  await recordAudit(req, {
    action: 'INTEREST_APPLIED',
    entity: 'account',
    entityId: accountNumber,
    message: `Applied ₹${interest} interest to ${accountNumber}`,
  });

  const response: IApiResponse = {
    success: true,
    message: 'Interest applied successfully',
    data: { interest },
  };

  res.json(response);
};

export const closeAccountController = async (req: AuthRequest, res: Response): Promise<void> => {
  const { accountNumber } = req.params;

  const owned = await loadAccountForUser(accountNumber, req.user!);
  await closeAccount(String(owned._id));

  await recordAudit(req, {
    action: 'ACCOUNT_CLOSED',
    entity: 'account',
    entityId: String(owned._id),
    message: `Closed ${accountNumber}`,
  });

  const response: IApiResponse = {
    success: true,
    message: 'Account closed successfully',
  };

  res.json(response);
};

/**
 * Place a hold on an account, or lift one.
 *
 * `account:freeze:any` was granted to manager and admin from the start but had
 * no endpoint behind it — a grant nothing requires, which is the same as no
 * control at all. This is that endpoint.
 *
 * Both directions go through `loadAccountForUser`, so branch scoping applies: a
 * manager can freeze an account in their own branch and is refused one in
 * another, which is the whole reason `account:freeze:any` is safe to grant at
 * branch level at all.
 *
 * Audited on both sides. A freeze stops a customer spending their own money, so
 * "who froze this and why" is the first question anyone asks afterwards.
 */
export const setAccountFrozenController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { accountNumber } = req.params;
  const frozen = req.body?.frozen;

  if (typeof frozen !== 'boolean') {
    throw new ValidationError('frozen must be true or false');
  }

  const owned = await loadAccountForUser(accountNumber, req.user!);
  const result = await setAccountFrozen(String(owned._id), frozen, req.body?.reason);

  await recordAudit(req, {
    action: frozen ? 'ACCOUNT_FROZEN' : 'ACCOUNT_UNFROZEN',
    entity: 'account',
    entityId: String(owned._id),
    message: frozen
      ? `Froze ${result.accountNumber}${req.body?.reason ? `: ${req.body.reason}` : ''}`
      : `Unfroze ${result.accountNumber}`,
  });

  const response: IApiResponse = {
    success: true,
    message: frozen
      ? 'Account frozen. It can be read but no money can move in or out.'
      : 'Account unfrozen and active again.',
    data: result,
  };

  res.json(response);
};