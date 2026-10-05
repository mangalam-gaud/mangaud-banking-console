import { z } from 'zod';

/** An id that must be a real Mongo ObjectId, for anything read back out. */
export const mongoIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Not a valid id');

/**
 * An optional Mongo ObjectId, for query parameters a caller may omit.
 *
 * Passing `?customerId=` empty or malformed must not become a 500 in the
 * ownership helper -- an unvalidated `customerId` reached
 * `Customer.findById(undefined)`.
 */
export const optionalMongoId = mongoIdSchema.optional();

export const registerSchema = z.object({
  body: z.object({
    firstName: z.string().min(1, 'First name is required').max(50),
    lastName: z.string().min(1, 'Last name is required').max(50),
    email: z.string().email('Invalid email format'),
    phone: z.string().min(10, 'Phone number must be at least 10 digits').max(15),
    password: z.string().min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number')
      .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
    confirmPassword: z.string(),
  }).refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(1, 'Password is required'),
    rememberMe: z.boolean().optional(),
  }),
});

export const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string().optional(),
  }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number')
      .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
    confirmPassword: z.string(),
  }).refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }),
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format'),
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Reset token is required'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number')
      .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
    confirmPassword: z.string(),
  }).refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }),
});

export const updateProfileSchema = z.object({
  body: z.object({
    firstName: z.string().min(1).max(50).optional(),
    lastName: z.string().min(1).max(50).optional(),
    phone: z.string().min(10).max(15).optional(),
    address: z.string().max(250).optional(),
    dateOfBirth: z.string().datetime().optional(),
  }),
});

export const openAccountSchema = z.object({
  body: z.object({
    accountType: z.enum(['SAVINGS', 'CURRENT', 'SALARY']),
    initialDeposit: z.number().min(0, 'Initial deposit cannot be negative').optional().default(0),
    currency: z.string().length(3).optional().default('INR'),
    /**
     * Required when a *staff* member opens the account, ignored for a customer.
     *
     * Optional in the schema rather than a separate route, because opening an
     * account is one action performed by two kinds of caller. The controller
     * refuses a staff call without it, which produces the useful error ("customerId
     * is required for this action") instead of a validation message about a field
     * a customer would never need.
     */
    customerId: z.string().optional(),
  }),
});

export const depositSchema = z.object({
  body: z.object({
    accountNumber: z.string().min(1, 'Account number is required'),
    amount: z.number().min(0.01, 'Amount must be positive'),
    description: z.string().max(400).optional(),
  }),
});

export const withdrawSchema = z.object({
  body: z.object({
    accountNumber: z.string().min(1, 'Account number is required'),
    amount: z.number().min(0.01, 'Amount must be positive'),
    description: z.string().max(400).optional(),
  }),
});

export const transferSchema = z.object({
  body: z.object({
    sourceAccountNumber: z.string().min(1, 'Source account number is required'),
    destinationAccountNumber: z.string().min(1, 'Destination account number is required'),
    amount: z.number().min(0.01, 'Amount must be positive'),
    description: z.string().max(400).optional(),
  }).refine((data) => data.sourceAccountNumber !== data.destinationAccountNumber, {
    message: 'Source and destination accounts must be different',
    path: ['destinationAccountNumber'],
  }),
});

export const applyLoanSchema = z.object({
  body: z.object({
    accountNumber: z.string().min(1, 'Account number is required'),
    principalAmount: z.number().min(1000, 'Minimum loan amount is 1000'),
    interestRate: z.number().min(0.1, 'Interest rate must be positive').max(30, 'Interest rate cannot exceed 30%'),
    termMonths: z.number().int().min(1, 'Term must be at least 1 month').max(360, 'Term cannot exceed 360 months'),
  }),
});

/**
 * Paying a saved payee.
 *
 * `amount` is a positive number and nothing else. The route previously ran with no
 * body schema at all, so a negative or zero amount reached the service, where
 * the only remaining check was the daily cap.
 *
 * `customerId` is required for staff and ignored for a customer: a teller paying
 * on someone's behalf has no Customer record of their own to resolve.
 */
export const payBeneficiarySchema = z.object({
  body: z.object({
    sourceAccountId: mongoIdSchema,
    beneficiaryId: mongoIdSchema,
    amount: z.number().positive('Amount must be greater than zero').max(10_000_000, 'A single payment cannot exceed Rs 1,00,00,000'),
    note: z.string().max(200).optional(),
    customerId: optionalMongoId,
  }),
});

/**
 * Recording money arriving into an account from outside.
 *
 * Counter-only (`payment:receive:any`). A caller-supplied `reference` is the one
 * idempotency hook on the payments path: the unique index on
 * `Transaction.reference` turns a replay into a conflict rather than a second
 * credit.
 */
export const recordIncomingSchema = z.object({
  body: z.object({
    accountId: mongoIdSchema,
    amount: z.number().positive('Amount must be greater than zero').max(10_000_000, 'A single incoming credit cannot exceed Rs 1,00,00,000'),
    from: z.string().min(1, 'Sender name is required').max(120),
    reference: z.string().min(1).max(40).optional(),
    note: z.string().max(200).optional(),
    customerId: mongoIdSchema,
  }),
});

/** Rail preview. Only the amount is read, so only the amount is validated. */
export const paymentPreviewSchema = z.object({
  body: z.object({
    amount: z.number().positive('Enter a valid amount'),
  }),
});

export const reversePaymentSchema = z.object({
  body: z.object({
    reason: z.string().max(200).optional(),
  }),
});

/** Depositing into an account from an external source. */
export const depositQuoteSchema = z.object({
  query: z.object({
    principal: z.coerce.number().min(1000, 'Minimum deposit is 1000').max(10_000_000),
    termMonths: z.coerce
      .number()
      .int()
      .refine((n) => [3, 6, 9, 12, 18, 24, 36, 60].includes(n), 'Choose a published term'),
  }),
});

export const openDepositSchema = z.object({
  body: z.object({
    sourceAccountId: mongoIdSchema,
    principal: z.number().min(1000, 'Minimum deposit is 1000').max(10_000_000),
    termMonths: z
      .number()
      .int()
      .refine((n) => [3, 6, 9, 12, 18, 24, 36, 60].includes(n), 'Choose a published term'),
    interestPayoutMode: z.enum(['MATURITY', 'MONTHLY']).optional(),
  }),
});

export const closeDepositSchema = z.object({
  body: z.object({
    reason: z.string().max(200).optional(),
    customerId: optionalMongoId,
  }),
});

export const standingInstructionSchema = z.object({
  body: z.object({
    sourceAccountId: mongoIdSchema,
    beneficiaryId: mongoIdSchema.optional(),
    destinationAccountNumber: z.string().min(1).optional(),
    amount: z.number().positive('Amount must be greater than zero').max(10_000_000),
    frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']),
    // Capped at 28 on purpose: a day-of-month of 29-31 silently never fires in
    // February, so the value is rejected rather than accepted and ignored.
    dayOfMonth: z.number().int().min(1).max(28, 'Day of month must be 1-28'),
    startDate: z.string().datetime('Invalid start date'),
    endDate: z.string().datetime('Invalid end date').optional(),
    nickname: z.string().max(60).optional(),
    customerId: optionalMongoId,
  }),
});

export const updateInstructionSchema = z.object({
  body: z.object({
    amount: z.number().positive('Amount must be greater than zero').max(10_000_000).optional(),
    nickname: z.string().max(60).optional(),
    dayOfMonth: z.number().int().min(1).max(28, 'Day of month must be 1-28').optional(),
    status: z.enum(['ACTIVE', 'PAUSED']).optional(),
  }),
});

export const nomineeSchema = z.object({
  body: z.object({
    accountId: mongoIdSchema,
    nominees: z
      .array(
        z.object({
          name: z.string().min(1, 'Name is required').max(80),
          relationship: z.string().min(1, 'Relationship is required').max(40),
          dateOfBirth: z.string().min(1, 'Date of birth is required'),
          mobile: z.string().min(1, 'Mobile is required').max(15),
          email: z.string().email().optional(),
          address: z.string().max(250).optional(),
          sharePercentage: z.number().min(1).max(100),
          identityProof: z.string().max(60).optional(),
        })
      )
      .min(1, 'Add at least one nominee')
      .max(4, 'A maximum of four nominees can be registered against one account'),
  }),
});

/**
 * The loan id for a repayment arrives as the `/:loanId/repay` path segment, not
 * in the body. Requiring it in the body too made every repayment fail
 * validation (400) unless the caller duplicated the id.
 */
export const repayLoanSchema = z.object({
  body: z.object({
    amount: z.number().positive('Repayment amount must be positive'),
    /**
     * Which of the borrower's own accounts pays.
     *
     * Optional: omitted, the loan's own account is debited, which is what
     * happened before this existed. Supplied, it must be an account the same
     * customer holds — the service checks that against the loan, because this
     * value arrives from the client and is the one place a customer could
     * otherwise aim a repayment at an account that is not theirs.
     */
    fromAccountId: z.string().min(1, 'Account id is invalid').optional(),
  }),
  params: z.object({
    loanId: z.string().min(1, 'Loan ID is required'),
  }),
});

/**
 * Savings-account interest, keyed by account number (used by
 * /accounts/calculate-interest and /accounts/apply-interest).
 */
export const calculateInterestSchema = z.object({
  body: z.object({
    accountNumber: z.string().min(1, 'Account number is required'),
    fromDate: z.string().datetime('Invalid from date format (ISO 8601)'),
    toDate: z.string().datetime('Invalid to date format (ISO 8601)'),
  }).refine((data) => new Date(data.toDate) > new Date(data.fromDate), {
    message: 'To date must be after from date',
    path: ['toDate'],
  }),
});

/**
 * Loan interest, keyed by loan id (used by /loans/calculate-interest).
 * The shared date-range validation is identical, only the subject differs --
 * reusing calculateInterestSchema here required an accountNumber the loan
 * endpoint never receives, so every call failed with "body.accountNumber
 * Required".
 */
export const calculateLoanInterestSchema = z.object({
  body: z.object({
    loanId: z.string().min(1, 'Loan ID is required'),
    fromDate: z.string().datetime('Invalid from date format (ISO 8601)'),
    toDate: z.string().datetime('Invalid to date format (ISO 8601)'),
  }).refine((data) => new Date(data.toDate) > new Date(data.fromDate), {
    message: 'To date must be after from date',
    path: ['toDate'],
  }),
});

export const statementQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    fromDate: z.string().datetime().optional(),
    toDate: z.string().datetime().optional(),
    type: z.string().optional(),
    minAmount: z.coerce.number().min(0).optional(),
    maxAmount: z.coerce.number().min(0).optional(),
    // Staff pass the customer they are acting for. Ignored for a customer, who
    // always resolves to their own record, so it is optional everywhere.
    customerId: optionalMongoId,
  }),
});

/**
 * Listing statements for the signed-in customer, or for `?customerId=` when the
 * caller is staff. Kept separate from `statementQuerySchema` (which validates the
 * ledger filter) so each names only the keys it applies to -- the validation
 * middleware replaces the whole member, so a schema listing extra keys would
 * strip them off the query.
 */
/**
 * Generating a statement for a period.
 *
 * The controller used to check for the three required fields by hand and 400 on
 * anything missing, which is a hand-rolled version of what the schema already
 * expresses. Dates are `datetime()` rather than any-parseable string so
 * `new Date("nonsense")` cannot reach the service as an Invalid Date and
 * silently produce an empty statement.
 */
export const generateStatementSchema = z.object({
  body: z.object({
    accountId: mongoIdSchema,
    fromDate: z.string().datetime('Invalid from date'),
    toDate: z.string().datetime('Invalid to date'),
    // Required for staff, ignored for a customer (who resolves to their own).
    customerId: optionalMongoId,
  }).refine((data) => new Date(data.toDate) > new Date(data.fromDate), {
    message: 'End date must be after start date',
    path: ['toDate'],
  }),
});

export const statementListQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    accountId: optionalMongoId,
    customerId: optionalMongoId,
  }),
});

export const accountsQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(['ACTIVE', 'FROZEN', 'BLOCKED', 'CLOSED', 'DORMANT']).optional(),
    accountType: z.enum(['SAVINGS', 'CURRENT', 'SALARY']).optional(),
    search: z.string().max(80).optional(),
  }),
});

export const loansQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(['APPLIED', 'APPROVED', 'DISBURSED', 'CLOSED', 'REJECTED']).optional(),
  }),
});

/**
 * Build a params schema for one Express path segment.
 *
 * The key has to be the literal segment name the route declares. A schema for
 * `:id` applied to a `/:loanId` route fails every request with "params.id
 * Required", which is why the first version of this file was called
 * `idParamSchema` and then used on routes whose segment was not `id`.
 */
const pathParam = (name: string, label: string) =>
  z.object({ params: z.object({ [name]: z.string().min(1, `${label} is required`) }) });

export const loanIdParamSchema = pathParam('loanId', 'Loan ID');
export const transactionIdParamSchema = pathParam('transactionId', 'Transaction ID');
export const accountNumberParamSchema = pathParam('accountNumber', 'Account number');
export const customerIdParamSchema = pathParam('customerId', 'Customer ID');
export const userIdParamSchema = pathParam('userId', 'Staff ID');

/**
 * A change to a staff record's authority.
 *
 * `role` is a whitelist of the six real roles rather than a free string, so a
 * typo cannot create a seventh role that no permission map describes — which
 * would silently grant that user an empty permission set and read as "RBAC is
 * broken" rather than "the role name is wrong".
 */
export const updateStaffSchema = z.object({
  body: z.object({
    role: z
      .enum(['customer', 'teller', 'loan_officer', 'manager', 'auditor', 'admin'])
      .optional(),
    branchCode: z.string().trim().toUpperCase().min(2).max(10).optional(),
    isActive: z.boolean().optional(),
  }),
});

/**
 * Freeze / unfreeze an account.
 *
 * `frozen` is required and must be an actual boolean. The route is a POST with
 * the state in the body rather than two separate paths, because "freeze" and
 * "unfreeze" are one operation on one field — and a typo like `{ "frozen":
 * "true" }` must not be coerced into a freeze nobody asked for. `z.boolean()`
 * rejects the string outright.
 */
export const freezeAccountSchema = z.object({
  body: z.object({
    frozen: z.boolean({
      required_error: 'frozen must be true or false',
      invalid_type_error: 'frozen must be true or false',
    }),
    reason: z.string().max(200, 'Reason cannot exceed 200 characters').optional(),
  }),
});

/**
 * Counter customer search.
 *
 * Two characters minimum: a single character matches most of the book, and a
 * result set that large is useless to the person searching and expensive to
 * return. The cap on `limit` is enforced in the controller as well, because a
 * query-string limit is caller-supplied and this is a PII collection.
 */
export const customersQuerySchema = z.object({
  query: z.object({
    q: z.string().min(2, 'Enter at least two characters to search'),
    limit: z.coerce.number().int().positive().max(50).optional(),
  }),
});

/**
 * A counter correction to a customer record.
 *
 * Address and phone only. Name, email, date of birth and KYC status are absent
 * *by design*: they are identity fields, and changing one is a KYC event governed
 * by `kyc:review`. Listing them here would let a schema change quietly widen a
 * permission, which is the failure mode a whitelist is supposed to prevent.
 *
 * "At least one field" is enforced in the controller rather than here with
 * `.refine()`: a refined schema is a `ZodEffects`, not a `ZodObject`, and the
 * validation middleware is typed for the plain shape. One owner for the rule is
 * better than two that can disagree.
 */
export const updateCustomerSchema = z.object({
  body: z.object({
    address: z.string().trim().min(4, 'Address is too short').max(250).optional(),
    phone: z.string().trim().min(10, 'Phone number looks too short').max(15).optional(),
  }),
});
export const statementIdParamSchema = pathParam('statementId', 'Statement ID');
export const notificationIdParamSchema = pathParam('notificationId', 'Notification ID');
export const cardIdParamSchema = pathParam('cardId', 'Card ID');
export const beneficiaryIdParamSchema = pathParam('beneficiaryId', 'Beneficiary ID');
export const instructionIdParamSchema = pathParam('instructionId', 'Instruction ID');
export const depositIdParamSchema = pathParam('depositId', 'Deposit ID');
export const sessionIdParamSchema = pathParam('sessionId', 'Session ID');
export const kycIdParamSchema = pathParam('kycId', 'KYC submission ID');
/** Card issuance. The `type`/`network` defaults live in the service. */
export const issueCardSchema = z.object({
  body: z.object({
    accountId: mongoIdSchema,
    type: z.enum(['DEBIT', 'CREDIT', 'VIRTUAL']).optional(),
    network: z.string().trim().max(20).optional(),
    nickname: z.string().trim().min(1).max(50).optional(),
  }),
});

export const cardLimitsSchema = z.object({
  body: z
    .object({
      dailyLimit: z.number().positive().max(10_000_000).optional(),
      monthlyLimit: z.number().positive().max(50_000_000).optional(),
    })
    .refine((v) => v.dailyLimit != null || v.monthlyLimit != null, {
      message: 'Provide dailyLimit, monthlyLimit, or both',
      path: ['dailyLimit'],
    }),
});

export const cardPinSchema = z.object({
  body: z.object({
    pin: z.string().regex(/^\d{4,6}$/, 'PIN must be digits'),
  }),
});

export const renameCardSchema = z.object({
  body: z.object({
    nickname: z.string().trim().min(1, 'Nickname is required').max(50),
  }),
});

/** A payee a customer saves. Field shape mirrors the Beneficiary model. */
export const addBeneficiarySchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(80),
    accountNumber: z.string().trim().min(9).max(18),
    ifsc: z.string().trim().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC code'),
    bankName: z.string().trim().min(1).max(80),
    accountHolderName: z.string().trim().min(1).max(80),
    accountType: z.enum(['SAVINGS', 'CURRENT', 'SALARY']),
    nickname: z.string().trim().max(50).optional(),
    upiId: z.string().trim().max(80).optional(),
    mobile: z.string().trim().max(15).optional(),
    email: z.string().email().max(80).optional(),
  }),
});

export const updateBeneficiarySchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(1).max(80).optional(),
      accountNumber: z.string().trim().min(9).max(18).optional(),
      ifsc: z.string().trim().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC code').optional(),
      bankName: z.string().trim().min(1).max(80).optional(),
      accountHolderName: z.string().trim().min(1).max(80).optional(),
      accountType: z.enum(['SAVINGS', 'CURRENT', 'SALARY']).optional(),
      nickname: z.string().trim().max(50).optional(),
      upiId: z.string().trim().max(80).optional(),
      mobile: z.string().trim().max(15).optional(),
      email: z.string().email().max(80).optional(),
    })
    .refine((v) => Object.values(v).some((field) => field != null), {
      message: 'Provide at least one field to update',
      path: ['name'],
    }),
});

export const notificationsQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    category: z.string().trim().max(30).optional(),
    unreadOnly: z
      .enum(['true', 'false'])
      .optional(),
  }),
});
