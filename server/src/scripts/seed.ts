import mongoose from 'mongoose';
import { pathToFileURL } from 'url';
import config from '../config';
import { connectDatabase } from '../utils/database';
import { User } from '../models/User';
import { Customer } from '../models/Customer';
import { Account } from '../models/Account';
import { Transaction } from '../models/Transaction';
import { Loan } from '../models/Loan';
import { Card, generateCardNumber, generateCVV } from '../models/Card';
import { Beneficiary } from '../models/Beneficiary';
import { Notification } from '../models/Notification';
import { AuditLog } from '../models/AuditLog';
import { Statement } from '../models/Statement';
import { SavingsInterestPosting, RefreshToken, PasswordResetToken } from '../models';
import { FixedDeposit, rateForTerm, DEPOSIT_RATE_CARD } from '../models/FixedDeposit';
import { StandingInstruction } from '../models/StandingInstruction';
import { Nominee } from '../models/Nominee';
import { KycSubmission } from '../models/KycSubmission';
import { hashSecret } from '../utils/crypto';
import { generateReference } from '../utils/reference';
import logger from '../utils/logger';

// ---------------------------------------------------------------- fixtures

const BANKS = {
  hdfc: { name: 'HDFC Bank', ifsc: 'HDFC0000246' },
  icici: { name: 'ICICI Bank', ifsc: 'ICIC0000031' },
  sbi: { name: 'State Bank of India', ifsc: 'SBIN0000417' },
  axis: { name: 'Axis Bank', ifsc: 'AXIS0000543' },
  kotak: { name: 'Kotak Mahindra Bank', ifsc: 'KKBK0000701' },
  pnb: { name: 'Punjab National Bank', ifsc: 'PUNB0000362' },
};

const CITIES = [
  { city: 'Bengaluru', state: 'Karnataka', pin: '560001' },
  { city: 'Mumbai', state: 'Maharashtra', pin: '400001' },
  { city: 'Chennai', state: 'Tamil Nadu', pin: '600001' },
  { city: 'Hyderabad', state: 'Telangana', pin: '500001' },
  { city: 'Pune', state: 'Maharashtra', pin: '411001' },
  { city: 'Delhi', state: 'Delhi', pin: '110001' },
  { city: 'Kochi', state: 'Kerala', pin: '682001' },
  { city: 'Jaipur', state: 'Rajasthan', pin: '302001' },
];

const LOCALITIES = [
  'Indiranagar', 'Koramangala', 'Whitefield', 'Jayanagar', 'HSR Layout',
  'Bandra West', 'Andheri East', 'Powai', 'T. Nagar', 'Adyar',
  'Banjara Hills', 'Gachibowli', 'Koregaon Park', 'Viman Nagar', 'Salt Lake',
];

/** Deterministic PRNG so a re-seed produces the same demo data. */
let seedState = 20260930;
const rand = () => {
  seedState = (seedState * 1103515245 + 12345) & 0x7fffffff;
  return seedState / 0x7fffffff;
};
const randInt = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const round2 = (n: number) => Math.round(n * 100) / 100;

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
const hoursAgo = (n: number) => new Date(Date.now() - n * 60 * 60 * 1000);

/** Indian mobile number: 10 digits starting 6-9. */
const indianPhone = (offset: number) => `+91 9${String(800000000 + offset).slice(0, 9)}`;

/** PAN format: 5 letters, 4 digits, 1 letter. */
const pan = (i: number) =>
  ['ABCPS', 'BCDPK', 'CDRPA', 'DAJPM', 'EAKPN'][i % 5] + String(1000 + i * 137).slice(0, 4) + 'F';

const addressFor = (i: number) => {
  const loc = pick(LOCALITIES);
  const c = CITIES[i % CITIES.length];
  return `${randInt(1, 240)}, ${loc}, ${c.city}, ${c.state} ${c.pin}`;
};

const upiFor = (first: string, i: number) =>
  `${first.toLowerCase()}.${String(1000 + i * 37)}@okhdfcbank`;

// ------------------------------------------------------------------ people

interface Person {
  first: string;
  last: string;
  email: string;
  phone: string;
  dob: string;
  address: string;
  pan: string;
  /** Branch serving this customer. See the note at Customer.create. */
  branchCode: string;
}

const PEOPLE: Person[] = [
  {
    first: 'Aarav', last: 'Sharma',
    email: 'aarav.sharma@mangaud.demo',
    phone: indianPhone(11),
    dob: '1991-04-12',
    address: addressFor(0),
    pan: pan(0),
    branchCode: 'BLR001',
  },
  {
    first: 'Priya', last: 'Nair',
    email: 'priya.nair@mangaud.demo',
    phone: indianPhone(12),
    dob: '1988-11-03',
    address: addressFor(1),
    pan: pan(1),
    branchCode: 'BLR001',
  },
  {
    first: 'Rohan', last: 'Patel',
    email: 'rohan.patel@mangaud.demo',
    phone: indianPhone(13),
    dob: '1994-07-28',
    address: addressFor(2),
    pan: pan(2),
    branchCode: 'BLR001',
  },
  {
    first: 'Ananya', last: 'Iyer',
    email: 'ananya.iyer@mangaud.demo',
    phone: indianPhone(14),
    dob: '1990-01-19',
    address: addressFor(3),
    pan: pan(3),
    branchCode: 'BLR001',
  },
  {
    first: 'Vikram', last: 'Singh',
    email: 'vikram.singh@mangaud.demo',
    phone: indianPhone(15),
    dob: '1985-09-07',
    address: addressFor(4),
    pan: pan(4),
    branchCode: 'BLR002',
  },
  {
    first: 'Meera', last: 'Reddy',
    email: 'meera.reddy@mangaud.demo',
    phone: indianPhone(16),
    dob: '1993-05-15',
    address: addressFor(5),
    pan: pan(5),
    branchCode: 'BLR002',
  },
  {
    first: 'Karthik', last: 'Subramanian',
    email: 'karthik.subramanian@mangaud.demo',
    phone: indianPhone(17),
    dob: '1987-12-22',
    address: addressFor(6),
    pan: pan(0),
    branchCode: 'BLR002',
  },
  {
    first: 'Diya', last: 'Chatterjee',
    email: 'diya.chatterjee@mangaud.demo',
    phone: indianPhone(18),
    dob: '1996-02-09',
    address: addressFor(7),
    pan: pan(1),
    branchCode: 'HO',
  },
];

const MERCHANTS = [
  'Big Bazaar', 'Reliance Fresh', 'Amazon India', 'Flipkart', 'Myntra',
  'IRCTC', 'Airtel recharge', 'Jio recharge', 'Apollo Pharmacy', 'Zomato',
  'Swiggy', 'Uber India', 'Ola Cabs', 'Indian Oil', 'BPCL Petrol',
  'DMart', 'Tata Cliq', 'PVR Cinemas', 'Indian Railways', 'MahaRERA',
  'LIC premium', 'Bajaj Allianz', 'Municipal tax', 'Electricity bill',
  'Salon appointment', 'Grocery run', 'Dining out', 'Fuel pump',
  'Hospital pharmacy', 'Book store',
];

const MERCHANT_CITIES = [
  'Bengaluru', 'Mumbai', 'Chennai', 'Hyderabad', 'Pune', 'Delhi', 'Kochi', 'Jaipur',
];

// -------------------------------------------------------------------- seed

/**
 * Every collection this schema owns. Anything else found in the database is
 * left over from an earlier version and is dropped by the seed.
 *
 * Explicit rather than derived from the registered models, so the check reads
 * as a list of what the app owns and adding a model makes you think about
 * whether its collection belongs here.
 */
const KNOWN_COLLECTIONS = new Set([
  'users',
  'customers',
  'accounts',
  'transactions',
  'loans',
  'loanpayments',
  'cards',
  'beneficiaries',
  'notifications',
  'auditlogs',
  'statements',
  'fixeddeposits',
  'standinginstructions',
  'nominees',
  'kycsubmissions',
  'savingsinterestpostings',
  'refreshtokens',
  'passwordresettokens',
]);

const seedDatabase = async (): Promise<void> => {
  try {
    await connectDatabase();

    // Clear every seeded collection. Audit and Notification are included so a
    // re-seed never leaves stale documents behind.
    await Promise.all([
      User.deleteMany({}),
      Customer.deleteMany({}),
      Account.deleteMany({}),
      Transaction.deleteMany({}),
      Loan.deleteMany({}),
      Card.deleteMany({}),
      Beneficiary.deleteMany({}),
      Notification.deleteMany({}),
      AuditLog.deleteMany({}),
      Statement.deleteMany({}),
      FixedDeposit.deleteMany({}),
      StandingInstruction.deleteMany({}),
      Nominee.deleteMany({}),
      KycSubmission.deleteMany({}),
      SavingsInterestPosting.deleteMany({}),
      RefreshToken.deleteMany({}),
  PasswordResetToken.deleteMany({}),
    ]);

    logger.info('Database cleared');

    /*
     * Drop collections left behind by earlier versions of the schema.
     *
     * `empdetail`, `reviews` and `scans` are unreferenced by any model and hold
     * zero documents, but they persist forever once created and then show up in
     * every database browser as three empty tables that read like missing
     * features. Enumerated against `KNOWN_COLLECTIONS` rather than dropping the
     * whole database, because a blanket `dropDatabase` would be a footgun in a
     * script whose whole job is to leave a usable database behind.
     */
    const db = mongoose.connection.db;
    if (db) {
      // The *driver's* `listCollections`, not Mongoose's `db.collections()`:
      // the latter returns Mongoose collection wrappers, whose shape differs
      // between versions and has no `.collection.name`. This returns a cursor
      // over the info documents directly.
      const listed = await db.listCollections({}, { nameOnly: true }).toArray();
      const stale = listed
        .map((c) => c.name)
        .filter((name) => !KNOWN_COLLECTIONS.has(name) && !name.startsWith('system.'));
      for (const name of stale) {
        await db.dropCollection(name);
      }
      if (stale.length) {
        logger.info(`Dropped ${stale.length} stale collection(s): ${stale.join(', ')}`);
      }
    }

    // ------------------------------------------------------------- staff
    /**
     * One member of every staff role, so the permission matrix can be
     * exercised end to end rather than only described. Branch staff carry a real
     * branch code; only the administrator sits at head office.
     */
    const STAFF = [
      {
        firstName: 'Vikram',
        lastName: 'Deshpande',
        email: 'admin@mangaud.demo',
        phone: indianPhone(1),
        password: 'Admin@123',
        role: 'admin' as const,
        branchCode: 'HO',
      },
      {
        firstName: 'Sunita',
        lastName: 'Rao',
        email: 'manager@mangaud.demo',
        phone: indianPhone(2),
        password: 'Manager@123',
        role: 'manager' as const,
        branchCode: 'BLR001',
      },
      {
        firstName: 'Ramesh',
        lastName: 'Gurumurthy',
        email: 'teller@mangaud.demo',
        phone: indianPhone(3),
        password: 'Teller@123',
        role: 'teller' as const,
        branchCode: 'BLR001',
      },
      {
        firstName: 'Nandini',
        lastName: 'Krishnan',
        email: 'loanofficer@mangaud.demo',
        phone: indianPhone(4),
        password: 'Officer@123',
        role: 'loan_officer' as const,
        branchCode: 'BLR001',
      },
      {
        firstName: 'Harish',
        lastName: 'Bose',
        email: 'auditor@mangaud.demo',
        phone: indianPhone(5),
        password: 'Auditor@123',
        role: 'auditor' as const,
        branchCode: 'HO',
      },
    ];

    const staffUsers: any[] = [];
    for (const member of STAFF) {
      staffUsers.push(
        await User.create({
          firstName: member.firstName,
          lastName: member.lastName,
          email: member.email,
          phone: member.phone,
          password: member.password,
          role: member.role,
          branchCode: member.branchCode,
          isEmailVerified: true,
        })
      );
    }

    const adminUser = staffUsers[0];

    logger.info(`${staffUsers.length} staff accounts created across 6 roles`);

    // --------------------------------------------------------- customers
    const customerUsers = [];
    const customers = [];

    for (let i = 0; i < PEOPLE.length; i++) {
      const p = PEOPLE[i];
      // The first four get a known password so they can be demoed directly.
      const knownPassword = i < 4 ? 'Customer@123' : `Customer@${1000 + i}`;

      const user = await User.create({
        firstName: p.first,
        lastName: p.last,
        email: p.email,
        phone: p.phone,
        password: knownPassword,
        role: 'customer',
        isEmailVerified: true,
      });

      const customer = await Customer.create({
        userId: user._id,
        firstName: p.first,
        lastName: p.last,
        email: p.email,
        phone: p.phone,
        address: p.address,
        /*
          Customers are deliberately spread across branches rather than all
          landing in one. Branch scoping is only provable when a teller has
          accounts they may NOT see: with every customer in one branch the
          isolation looks identical to the "staff see everything" behaviour it
          replaced, and a seed like that would make the feature untestable.
          The staff logins are all BLR001 except admin (HO), so BLR001's teller
          and manager have something to be scoped away from.
        */
        branchCode: p.branchCode,
        dateOfBirth: new Date(p.dob),
        kycStatus: i < 6 ? 'verified' : i === 6 ? 'pending' : 'rejected',
        kycDocuments:
          i < 6
            ? ['Aadhaar', 'PAN', 'Passport']
            : i === 6
              ? ['Aadhaar', 'PAN']
              : ['Aadhaar'],
      });

      customerUsers.push(user);
      customers.push(customer);
    }

    logger.info(`${customers.length} customers created`);

    // ---------------------------------------------------------- accounts
    // Account numbers follow the Indian 12-digit style seen on statements.
    const accounts: any[] = [];
    let accountSeq = 100000000001;

    const plan: Array<{ type: 'SAVINGS' | 'CURRENT' | 'SALARY'; opening: number }> = [
      { type: 'SAVINGS', opening: 185000 },
      { type: 'CURRENT', opening: 92000 },
      { type: 'SAVINGS', opening: 64000 },
      { type: 'SALARY', opening: 118000 },
      { type: 'SAVINGS', opening: 38500 },
      { type: 'CURRENT', opening: 142000 },
      { type: 'SAVINGS', opening: 52000 },
      { type: 'SALARY', opening: 76000 },
    ];

    for (let i = 0; i < customers.length; i++) {
      const { type, opening } = plan[i % plan.length];
      const accountNumber = String(accountSeq++);

      const account = await Account.create({
        customerId: customers[i]._id,
        branchCode: customers[i].branchCode ?? 'HO',
        accountNumber,
        accountType: type,
        balance: opening,
        interestRate: type === 'SAVINGS' ? randInt(350, 425) / 100 : type === 'SALARY' ? 3 : 0,
        status: i === 7 ? 'FROZEN' : 'ACTIVE',
        currency: 'INR',
        openedAt: daysAgo(randInt(200, 1400)),
      });

      accounts.push(account);

      // Every second customer also gets a linked savings account.
      if (i % 2 === 0) {
        const second = await Account.create({
          customerId: customers[i]._id,
          accountNumber: String(accountSeq++),
          accountType: 'SAVINGS',
          balance: round2(opening * 0.4),
          interestRate: 4.1,
          status: 'ACTIVE',
          currency: 'INR',
          openedAt: daysAgo(randInt(100, 700)),
        });
        accounts.push(second);
      }
    }

    logger.info(`${accounts.length} accounts created`);

    // ------------------------------------------------------- transactions
    // Balances are derived by replaying the ledger, so the opening balance
    // always matches the sum of its transactions.
    const balances = new Map<string, number>();
    for (const account of accounts) {
      balances.set(String(account._id), 0);
    }

    const txns: any[] = [];

const pushTxn = (account: any, fields: any) => {
      const key = String(account._id);
      const isCredit = [
        'OPENING_DEPOSIT', 'DEPOSIT', 'TRANSFER_IN', 'LOAN_DISBURSEMENT', 'INTEREST',
      ].includes(fields.transactionType);
      const next = round2(balances.get(key)! + (isCredit ? fields.amount : -fields.amount));
      balances.set(key, next);

      /*
       * A completed transaction can never be dated in the future.
       *
       * The daily generators pick a day offset and then set an hour between 07
       * and 22. For `day = 0` that is today's date at up to 22:00, so any run
       * before late evening produced rows stamped hours ahead -- the dashboard
       * rendered them as "Hospital pharmacy � Withdrawal � in 6h", a completed
       * withdrawal apparently scheduled for later today. `formatRelativeTime`
       * was correct; the data was not.
       *
       * Clamping here rather than at each generator means no future-dated row
       * can be produced by a generator added later.
       */
      const now = new Date();
      const createdAt = fields.createdAt ? new Date(fields.createdAt) : now;
      const stamped = createdAt > now ? new Date(now.getTime() - 60_000) : createdAt;

      txns.push({
        accountId: account._id,
        ...fields,
        createdAt: stamped,
        balanceAfter: next,
      });
    };

    for (const account of accounts) {
      const opening = account.balance;
      pushTxn(account, {
        transactionType: 'OPENING_DEPOSIT',
        amount: opening,
        description: 'Opening balance',
        status: 'COMPLETED',
        reference: generateReference('OD'),
        createdAt: account.openedAt,
      });
    }

    /**
     * Every customer's primary account. Salary is credited here and the fixed
     * monthly obligations are paid out of it, which is how the balances end up
     * looking like real accounts instead of a steadily growing pot.
     */
    const primaryOf = (customerId: string) =>
      accounts.find(
        (a) => String(a.customerId) === String(customerId) && a.status === 'ACTIVE'
      );

    // Salary credits + recurring monthly obligations, six months back.
    const FIXED_COSTS = [
      { label: 'House rent', min: 18000, max: 65000 },
      { label: 'Home loan EMI', min: 24000, max: 68000 },
      { label: 'Electricity bill', min: 1400, max: 5200 },
      { label: 'Mobile & DTH', min: 900, max: 3100 },
      { label: 'School fees', min: 8000, max: 42000 },
      { label: 'Term insurance premium', min: 1800, max: 9400 },
      { label: 'Gas cylinder', min: 800, max: 1500 },
      { label: 'Society maintenance', min: 1500, max: 6500 },
    ];

    for (let month = 5; month >= 0; month--) {
      for (let i = 0; i < customers.length; i++) {
        const primary = primaryOf(customers[i]._id);
        if (!primary) continue;

        const salary = round2(randInt(95000, 235000) + rand());
        pushTxn(primary, {
          transactionType: 'DEPOSIT',
          amount: salary,
          description: 'Salary credit',
          status: 'COMPLETED',
          reference: generateReference('SAL'),
          createdAt: daysAgo(month * 30 + 1),
        });

        // Each customer carries a different subset of obligations.
        const obligations = FIXED_COSTS.filter(() => rand() < 0.75).slice(0, randInt(3, 6));
        for (const cost of obligations) {
          const when = daysAgo(month * 30 + randInt(2, 9));
          pushTxn(primary, {
            transactionType: 'WITHDRAWAL',
            amount: round2(randInt(cost.min, cost.max)),
            description: cost.label,
            status: 'COMPLETED',
            reference: generateReference('BIL'),
            createdAt: when,
          });
        }
      }
    }

    // Daily spending over the last 120 days.
    for (let day = 120; day >= 0; day--) {
      const txnCount = randInt(1, 6);
      for (let n = 0; n < txnCount; n++) {
        const account = pick(accounts);
        if (account.status !== 'ACTIVE') continue;

        const key = String(account._id);
        const current = balances.get(key)!;
        if (current < 5000) continue;

        const isWithdrawal = rand() < 0.86;
        const merchant = pick(MERCHANTS);
        const when = daysAgo(day);
        when.setHours(randInt(7, 22), randInt(0, 59), 0, 0);

        if (isWithdrawal) {
          const amount = round2(
            rand() < 0.05
              ? randInt(12000, 65000) // big-ticket
              : randInt(180, 8500) // everyday spend
          );
          if (amount > current) continue;
          pushTxn(account, {
            transactionType: 'WITHDRAWAL',
            amount,
            description: merchant,
            status: 'COMPLETED',
            reference: generateReference('WD'),
            createdAt: when,
          });
        } else {
          pushTxn(account, {
            transactionType: 'DEPOSIT',
            amount: round2(randInt(500, 12000)),
            description: `Refund from ${merchant}`,
            status: 'COMPLETED',
            reference: generateReference('RF'),
            createdAt: when,
          });
        }
      }
    }

    // Internal transfers between the seeded customers' accounts.
    for (let n = 0; n < 14; n++) {
      const from = pick(accounts.filter((a) => balances.get(String(a._id))! > 25000));
      const to = pick(accounts.filter((a) => String(a._id) !== String(from._id)));
      if (!from || !to) continue;

      const amount = round2(randInt(2000, 40000));
      if (amount > balances.get(String(from._id))!) continue;

      // Moving money between your own two accounts otherwise reads as
      // "Transfer to <your own name>", which looks like somebody else paid
      // you. Name the destination account type when both sides are yours.
      const sameCustomer = String(from.customerId) === String(to.customerId);
      const fromName = PEOPLE[accounts.indexOf(from) % PEOPLE.length];
      const toName = PEOPLE[accounts.indexOf(to) % PEOPLE.length];

      const outLabel = sameCustomer
        ? `Transfer to own ${to.accountType.toLowerCase()} account`
        : `Transfer to ${toName.first} ${toName.last}`;
      const inLabel = sameCustomer
        ? `Transfer from own ${from.accountType.toLowerCase()} account`
        : `Transfer from ${fromName.first} ${fromName.last}`;

      const ref = generateReference('TRF');
      const when = daysAgo(randInt(1, 90));

      pushTxn(from, {
        transactionType: 'TRANSFER_OUT',
        amount,
        relatedAccountId: to._id,
        description: outLabel,
        status: 'COMPLETED',
        reference: `${ref}OUT`,
        createdAt: when,
      });
      pushTxn(to, {
        transactionType: 'TRANSFER_IN',
        amount,
        relatedAccountId: from._id,
        description: inLabel,
        status: 'COMPLETED',
        reference: `${ref}IN`,
        createdAt: when,
      });
    }

    await Transaction.insertMany(txns);
    logger.info(`${txns.length} transactions created`);

    // -------------------------------------------------------------- loans
    const loanSpecs = [
      { idx: 0, principal: 450000, rate: 8.9, months: 60, status: 'DISBURSED', paid: 8 },
      { idx: 2, principal: 850000, rate: 9.4, months: 180, status: 'DISBURSED', paid: 22 },
      { idx: 3, principal: 250000, rate: 11.2, months: 36, status: 'APPROVED', paid: 0 },
      { idx: 5, principal: 80000, rate: 14.5, months: 12, status: 'APPLIED', paid: 0 },
      { idx: 6, principal: 600000, rate: 8.2, months: 120, status: 'REJECTED', paid: 0 },
    ];

    const emi = (principal: number, annualRate: number, months: number) => {
      const r = annualRate / 12 / 100;
      if (r === 0) return round2(principal / months);
      return round2((principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1));
    };

    const loans: any[] = [];
    for (const spec of loanSpecs) {
      const customer = customers[spec.idx];
      const account = accounts.find(
        (a) => String(a.customerId) === String(customer._id) && a.status === 'ACTIVE'
      );
      if (!account) continue;

      const monthly = emi(spec.principal, spec.rate, spec.months);
      const paidAmount = round2(monthly * spec.paid);
      const outstanding = round2(spec.principal - (paidAmount * 0.72));

      const appliedAt = daysAgo(spec.paid * 30 + randInt(10, 60));
      const loan = await Loan.create({
        accountId: account._id,
        principalAmount: spec.principal,
        interestRate: spec.rate,
        termMonths: spec.months,
        outstandingAmount: spec.status === 'DISBURSED' ? Math.max(0, outstanding) : spec.principal,
        status: spec.status as any,
        appliedAt,
        approvedAt: spec.status !== 'APPLIED' ? daysAgo(spec.paid * 30 + 3) : undefined,
        disbursedAt: spec.status === 'DISBURSED' ? daysAgo(spec.paid * 30) : undefined,
        emiAmount: monthly,
        nextDueDate: spec.status === 'DISBURSED' ? daysAgo(-randInt(3, 27)) : undefined,
        totalPaid: paidAmount,
        progressPercentage:
          spec.status === 'DISBURSED' ? Math.round((spec.paid / spec.months) * 100) : 0,
      });

      loans.push({ ...loan.toObject(), paid: spec.paid, account, customer });

      if (spec.status === 'DISBURSED') {
        const key = String(account._id);
        balances.set(key, round2(balances.get(key)! + spec.principal));
        await Transaction.create({
          accountId: account._id,
          transactionType: 'LOAN_DISBURSEMENT',
          amount: spec.principal,
          balanceAfter: balances.get(key)!,
          description: `Loan disbursement (${spec.months} months @ ${spec.rate}%)`,
          status: 'COMPLETED',
          reference: generateReference('LD'),
          createdAt: daysAgo(spec.paid * 30),
        });
      }

      // Repayment history
      for (let p = 1; p <= spec.paid; p++) {
        const when = daysAgo((spec.paid - p) * 30 + 2);
        const interestPortion = round2((spec.principal / spec.months) * 0.32);
        const principalPortion = round2(monthly - interestPortion);
        await Transaction.create({
          accountId: account._id,
          transactionType: 'LOAN_REPAYMENT',
          amount: monthly,
          balanceAfter: balances.get(String(account._id))!,
          description: `EMI #${p} of ${spec.months}`,
          status: 'COMPLETED',
          reference: generateReference('EMI'),
          createdAt: when,
        });
        loan.payments = loan.payments || [];
        loan.payments.push({
          loanId: loan._id,
          paymentAmount: monthly,
          principalPortion,
          interestPortion,
          paymentDate: when,
          status: 'COMPLETED',
          reference: generateReference('EMR'),
        });
        loan.outstandingAmount = Math.max(0, round2(loan.outstandingAmount - principalPortion));
        loan.lastPaymentAt = when;
      }
      if (spec.paid > 0) await loan.save();
    }

    logger.info(`${loans.length} loans created`);

    // -------------------------------------------------------------- cards
    const cards: any[] = [];
    for (let i = 0; i < customers.length; i++) {
      const customer = customers[i];
      const own = accounts.filter((a) => String(a.customerId) === String(customer._id));
      if (!own.length) continue;

      const primary = own[0];
      cards.push(
        await Card.create({
          cardNumber: generateCardNumber(),
          cardholderName: `${PEOPLE[i].first} ${PEOPLE[i].last}`.toUpperCase(),
          accountId: primary._id,
          customerId: customer._id,
          type: 'DEBIT',
          network: pick(['VISA', 'MASTERCARD', 'RUPAY']),
          status: i === 5 ? 'FROZEN' : 'ACTIVE',
          expiryMonth: randInt(1, 12),
          expiryYear: 2029,
          cvv: generateCVV(),
pinSet: i % 2 === 0,
          // Keep the two in step. `pinSet` claims a PIN exists; a card with the
          // flag set and no hash is a state the app cannot produce -- setting a
          // PIN writes both in one save -- so seeding one produces demo data
          // that looks like the bug this field used to have.
          pinHash: i % 2 === 0 ? hashSecret(String(randInt(1000, 9999))) : undefined,
          dailyLimit: i % 3 === 0 ? 100000 : 50000,
          monthlyLimit: i % 3 === 0 ? 500000 : 250000,
          spentThisMonth: round2(randInt(4000, 90000)),
          nickname: 'Primary card',
          colour: ['ink', 'brass', 'forest', 'slate', 'plum'][i % 5],
          issuedAt: daysAgo(randInt(60, 900)),
          frozenAt: i === 5 ? daysAgo(2) : undefined,
          frozenReason: i === 5 ? 'Frozen by customer' : undefined,
        })
      );

      // A virtual card for a couple of customers.
      if (i < 2) {
        cards.push(
          await Card.create({
            cardNumber: generateCardNumber(),
            cardholderName: `${PEOPLE[i].first} ${PEOPLE[i].last}`.toUpperCase(),
            accountId: primary._id,
            customerId: customer._id,
            type: 'VIRTUAL',
            network: 'VISA',
            status: 'ACTIVE',
            expiryMonth: 6,
            expiryYear: 2030,
cvv: generateCVV(),
            pinSet: true,
            // A PIN without its hash is a state the app cannot reach, and it was
            // reachable from the seed alone: `pinSet` was set without a hash, so
            // the card claimed a PIN that was never stored.
            pinHash: hashSecret(String(randInt(1000, 9999))),
            dailyLimit: 25000,
            monthlyLimit: 100000,
            spentThisMonth: round2(randInt(500, 20000)),
            nickname: 'Online shopping',
            colour: 'plum',
            issuedAt: daysAgo(randInt(10, 120)),
          })
        );
      }
    }

    logger.info(`${cards.length} cards created`);

    // ------------------------------------------------------- beneficiaries
    const beneficiaries: any[] = [];
    for (let i = 0; i < customers.length; i++) {
      const customer = customers[i];
      const owner = PEOPLE[i];

      const payees: Array<{ name: string; bank: keyof typeof BANKS; type: 'SAVINGS' | 'CURRENT' | 'SALARY' }> = [
        { name: `${PEOPLE[(i + 1) % PEOPLE.length].first} ${PEOPLE[(i + 1) % PEOPLE.length].last}`, bank: 'hdfc', type: 'SAVINGS' },
        { name: `${PEOPLE[(i + 2) % PEOPLE.length].first} ${PEOPLE[(i + 2) % PEOPLE.length].last}`, bank: 'icici', type: 'CURRENT' },
        { name: `${PEOPLE[(i + 3) % PEOPLE.length].first} ${PEOPLE[(i + 3) % PEOPLE.length].last}`, bank: 'axis', type: 'SAVINGS' },
      ];

      for (let p = 0; p < payees.length; p++) {
        const payee = payees[p];
        const isActive = !(i === 7 && p === 2);
        if (!isActive) continue;

        beneficiaries.push(
          await Beneficiary.create({
            customerId: customer._id,
            userId: customerUsers[i]._id,
            name: payee.name,
            accountNumber: String(randInt(10000000000, 99999999999)),
            ifsc: BANKS[payee.bank].ifsc,
            bankName: BANKS[payee.bank].name,
            accountHolderName: payee.name,
            accountType: payee.type,
            upiId: upiFor(payee.name.split(' ')[0], i * 3 + p),
            mobile: indianPhone(100 + i * 3 + p),
            email: `${payee.name.split(' ')[0].toLowerCase()}@mangaud.demo`,
            nickname: p === 0 ? 'Home' : p === 1 ? 'Business' : undefined,
            isFavourite: p === 0,
            dailyLimit: [100000, 250000, 50000][p],
            transferredTotal: round2(randInt(5000, 320000)),
            transferCount: randInt(1, 24),
            lastTransferredAt: daysAgo(randInt(1, 40)),
            status: 'ACTIVE',
          })
        );
      }
    }

    logger.info(`${beneficiaries.length} beneficiaries created`);

    // --------------------------------------------------- outward payments
    for (let n = 0; n < 18; n++) {
      const i = randInt(0, customers.length - 1);
      const own = accounts.filter(
        (a) => String(a.customerId) === String(customers[i]._id) && a.status === 'ACTIVE'
      );
      const payees = beneficiaries.filter(
        (b) => String(b.customerId) === String(customers[i]._id)
      );
      if (!own.length || !payees.length) continue;

      const from = pick(own);
      const payee = pick(payees);
      const key = String(from._id);
      const amount = round2(randInt(500, 45000));
      if (amount > balances.get(key)!) continue;

      balances.set(key, round2(balances.get(key)! - amount));
      await Transaction.create({
        accountId: from._id,
        transactionType: 'TRANSFER_OUT',
        amount,
        balanceAfter: balances.get(key)!,
        beneficiaryId: payee._id,
        counterparty: {
          name: payee.accountHolderName,
          accountNumber: payee.accountNumber,
          ifsc: payee.ifsc,
          bankName: payee.bankName,
          upiId: payee.upiId,
        },
        description: `Paid to ${payee.accountHolderName}`,
        status: 'COMPLETED',
        reference: generateReference('PAY'),
        createdAt: daysAgo(randInt(0, 45)),
        metadata: { channel: amount <= 100000 ? 'IMPS' : 'NEFT' },
      });
    }

    // Sync every account balance to the replayed ledger total.
    for (const account of accounts) {
      const finalBalance = balances.get(String(account._id))!;
      if (finalBalance < 0) {
        // Should not happen; guard anyway rather than writing a negative balance.
        await Account.findByIdAndUpdate(account._id, { balance: 0 });
        continue;
      }
      await Account.findByIdAndUpdate(account._id, { balance: finalBalance });
      account.balance = finalBalance;
    }
    logger.info('Balances reconciled with the transaction ledger');

    // -------------------------------------------------------- statements
    let statementCount = 0;
    for (let i = 0; i < customers.length; i++) {
      const own = accounts.filter((a) => String(a.customerId) === String(customers[i]._id));
      for (const account of own.slice(0, 1)) {
        const periodTxns = await Transaction.find({
          accountId: account._id,
          createdAt: { $gte: daysAgo(90), $lte: new Date() },
          status: 'COMPLETED',
        })
          .sort({ createdAt: 1 })
          .lean();

        if (!periodTxns.length) continue;

        const prior = await Transaction.findOne({
          accountId: account._id,
          createdAt: { $lt: daysAgo(90) },
          status: 'COMPLETED',
        })
          .sort({ createdAt: -1 })
          .select('balanceAfter')
          .lean();

        const openingBalance = prior?.balanceAfter ?? 0;
        let credits = 0;
        let debits = 0;

        const rows = periodTxns.map((t) => {
          const isCredit = [
            'OPENING_DEPOSIT', 'DEPOSIT', 'TRANSFER_IN', 'LOAN_DISBURSEMENT', 'INTEREST',
          ].includes(t.transactionType);
          if (isCredit) credits += t.amount;
          else debits += t.amount;
          return {
            date: t.createdAt,
            reference: t.reference,
            description: t.description || t.transactionType,
            type: t.transactionType,
            debit: isCredit ? 0 : t.amount,
            credit: isCredit ? t.amount : 0,
            balance: t.balanceAfter,
          };
        });

        await Statement.create({
          statementNumber: generateReference('STMT'),
          accountId: account._id,
          accountNumber: account.accountNumber,
          customerId: customers[i]._id,
          userId: customerUsers[i]._id,
          fromDate: daysAgo(90),
          toDate: new Date(),
          periodLabel: 'Quarterly statement',
          openingBalance,
          closingBalance: rows[rows.length - 1].balance,
          totalCredits: round2(credits),
          totalDebits: round2(debits),
          transactionCount: rows.length,
          rows,
          generatedAt: daysAgo(randInt(1, 20)),
        });
        statementCount++;
      }
    }
    logger.info(`${statementCount} statements created`);

    // ----------------------------------------------------- notifications
    const notificationCount = 8 + randInt(0, 6);
    for (let n = 0; n < notificationCount; n++) {
      const i = randInt(0, customers.length - 1);
      const kinds = [
        {
          category: 'transaction' as const,
          title: `₹${randInt(500, 25000).toLocaleString('en-IN')} debited`,
          body: `${pick(MERCHANTS)} · A/C ${accounts[i * 2]?.accountNumber.slice(-4) || '0000'}`,
          link: '/transactions',
          priority: 'normal' as const,
        },
        {
          category: 'security' as const,
          title: 'New sign-in from a new device',
          body: `Chrome on Windows · ${pick(MERCHANT_CITIES)}`,
          link: '/security',
          priority: 'high' as const,
        },
        {
          category: 'card' as const,
          title: 'Card statement ready',
          body: 'Your monthly card summary is available.',
          link: '/cards',
          priority: 'low' as const,
        },
        {
          category: 'loan' as const,
          title: 'EMI due in 5 days',
          body: `₹${randInt(4000, 28000).toLocaleString('en-IN')} will be debited from your account.`,
          link: '/loans',
          priority: 'high' as const,
        },
        {
          category: 'account' as const,
          title: 'Savings interest credited',
          body: 'Your quarterly interest has been added to your account.',
          link: '/accounts',
          priority: 'normal' as const,
        },
      ];
      const kind = pick(kinds);

      await Notification.create({
        userId: customerUsers[i]._id,
        customerId: customers[i]._id,
        category: kind.category,
        title: kind.title,
        body: kind.body,
        link: kind.link,
        priority: kind.priority,
        read: rand() < 0.4,
        readAt: rand() < 0.4 ? daysAgo(randInt(0, 5)) : undefined,
        createdAt: hoursAgo(randInt(1, 240)),
      });
    }
    logger.info('Notifications created');

    // -------------------------------------------------------- audit trail
    const auditActions = [
      { action: 'LOGIN', entity: 'auth', message: 'Signed in successfully' },
      { action: 'ACCOUNT_TRANSFER', entity: 'account', message: 'Transferred to a saved payee' },
      { action: 'CARD_FREEZE', entity: 'card', message: 'Card frozen' },
      { action: 'STATEMENT_GENERATED', entity: 'statement', message: 'Quarterly statement generated' },
      { action: 'PAYMENT_SENT', entity: 'transaction', message: 'Payment sent' },
      { action: 'BENEFICIARY_ADD', entity: 'beneficiary', message: 'Payee added' },
    ];

    for (let n = 0; n < 40; n++) {
      const i = randInt(0, customers.length - 1);
      const spec = pick(auditActions);
      const isFailure = rand() < 0.12;
      await AuditLog.create({
        actorId: customerUsers[i]._id,
        actorEmail: customerUsers[i].email,
        actorRole: 'customer',
        action: isFailure ? 'LOGIN_FAILED' : spec.action,
        entity: isFailure ? 'auth' : spec.entity,
        status: isFailure ? 'FAILURE' : 'SUCCESS',
        ip: `10.0.${randInt(0, 20)}.${randInt(2, 250)}`,
        userAgent: pick([
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0',
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4) Safari/605.1',
          'Mozilla/5.0 (Linux; Android 14) Chrome/123.0 Mobile',
        ]),
        message: isFailure ? 'Incorrect password' : spec.message,
        createdAt: hoursAgo(randInt(1, 720)),
      });
    }

    for (let n = 0; n < 8; n++) {
      const staff = rand() < 0.5 ? adminUser : staffUsers[1];
      await AuditLog.create({
        actorId: staff._id,
        actorEmail: staff.email,
        actorRole: staff.role,
        action: pick(['KYC_APPROVED', 'LOAN_REVIEWED', 'ACCOUNT_VIEWED', 'REPORT_EXPORTED']),
        entity: pick(['customer', 'loan', 'account', 'report']),
        status: 'SUCCESS',
        ip: `10.0.1.${randInt(2, 250)}`,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0',
        message: 'Reviewed a record',
        createdAt: hoursAgo(randInt(1, 480)),
      });
    }
    logger.info('Audit entries created');

    // ---------------------------------------------------------- deposits
    let depositCount = 0;
    for (let i = 0; i < customers.length; i++) {
      const customer = customers[i];
      const own = accounts.filter((a) => String(a.customerId) === String(customer._id) && a.status === 'ACTIVE');
      if (!own.length) continue;

      // One live deposit and, for some customers, one that has already paid
      // out, so the history and maturity states are both represented.
      const principal = [50000, 100000, 250000, 75000, 150000, 200000, 60000, 90000][i % 8];
      const termMonths = [6, 12, 24, 9, 36, 12, 18, 60][i % 8];
      const rate = rateForTerm(termMonths);
      const interest = round2((principal * (rate / 100) * termMonths) / 12);

      // Opened far enough back to look like a real deposit, but never so far
      // back that the term has already run. An `ACTIVE` deposit whose maturity
      // date is in the past gets swept to `MATURED` by the scheduler within
      // five minutes of the server starting, which left every "active deposits"
      // tile reading zero against a list that plainly showed deposits.
      const termDays = termMonths * 30;
      const openedAt = daysAgo(randInt(20, Math.max(30, termDays - 60)));

      const maturesAt = new Date(openedAt);
      maturesAt.setMonth(maturesAt.getMonth() + termMonths);

      await FixedDeposit.create({
        reference: generateReference('FD'),
        customerId: customer._id,
        userId: customerUsers[i]._id,
        sourceAccountId: own[0]._id,
        principal,
        interestRate: rate,
        termMonths,
        maturityAmount: round2(principal + interest),
        interestAmount: interest,
        interestPayoutMode: i % 3 === 0 ? 'MONTHLY' : 'MATURITY',
        status: 'ACTIVE',
        openedAt,
        maturesAt,
      });
      depositCount++;

      if (i % 2 === 0) {
        const oldPrincipal = round2(principal * 0.6);
        const oldTerm = 12;
        const oldRate = rateForTerm(oldTerm);
        const oldOpened = daysAgo(500 + randInt(0, 200));
        const oldMatures = new Date(oldOpened);
        oldMatures.setMonth(oldMatures.getMonth() + oldTerm);
        await FixedDeposit.create({
          reference: generateReference('FD'),
          customerId: customer._id,
          userId: customerUsers[i]._id,
          sourceAccountId: own[0]._id,
          principal: oldPrincipal,
          interestRate: oldRate,
          termMonths: oldTerm,
          maturityAmount: round2(oldPrincipal * 1.07),
          interestAmount: round2(oldPrincipal * 0.07),
          interestPayoutMode: 'MATURITY',
          status: 'MATURED',
          openedAt: oldOpened,
          maturesAt: oldMatures,
          maturedAt: oldMatures,
          interestCredited: round2(oldPrincipal * 0.07),
        });
        depositCount++;
      }
    }
    logger.info(`${depositCount} fixed deposits created`);

    // ---------------------------------------------- standing instructions
    const INSTRUCTION_RECIPES = [
      { nickname: 'House rent', amount: [18000, 32000], frequency: 'MONTHLY', day: 1 },
      { nickname: 'Electricity bill', amount: [900, 3200], frequency: 'MONTHLY', day: 12 },
      { nickname: 'School fees', amount: [6000, 18000], frequency: 'QUARTERLY', day: 5 },
      { nickname: 'Family transfer', amount: [5000, 15000], frequency: 'MONTHLY', day: 15 },
      { nickname: 'Insurance premium', amount: [1800, 5400], frequency: 'YEARLY', day: 20 },
      { nickname: 'Grocery contribution', amount: [2000, 6000], frequency: 'WEEKLY', day: 6 },
    ];

    let instructionCount = 0;
    for (let i = 0; i < customers.length; i++) {
      const customer = customers[i];
      const own = accounts.filter((a) => String(a.customerId) === String(customer._id) && a.status === 'ACTIVE');
      const payees = beneficiaries.filter((b) => String(b.customerId) === String(customer._id));
      if (!own.length || !payees.length) continue;

      const recipe = INSTRUCTION_RECIPES[i % INSTRUCTION_RECIPES.length];
      const payee = payees[i % payees.length];

      // Some are overdue so the sweep has something to do, some are scheduled
      // ahead. A day or two in the past also exercises the catch-up path.
      const startDate = daysAgo(randInt(30, 120));
      let nextRunDate = new Date(startDate);
      if (recipe.frequency === 'MONTHLY') nextRunDate.setDate(recipe.day);
      if (i % 3 === 0) nextRunDate = daysAgo(randInt(1, 5));
      else nextRunDate.setDate(Math.min(28, recipe.day + randInt(3, 20)));

      const completed = randInt(0, 6);
      await StandingInstruction.create({
        reference: generateReference('SI'),
        customerId: customer._id,
        userId: customerUsers[i]._id,
        sourceAccountId: own[0]._id,
        beneficiaryId: payee._id,
        nickname: recipe.nickname,
        amount: randInt(recipe.amount[0], recipe.amount[1]),
        frequency: recipe.frequency,
        dayOfMonth: recipe.day,
        startDate,
        nextRunDate,
        runsCompleted: completed,
        totalDebited: randInt(5000, 240000),
        status: i % 4 === 3 ? 'PAUSED' : 'ACTIVE',
        pausedAt: i % 4 === 3 ? daysAgo(randInt(1, 20)) : undefined,
        pauseReason: i % 4 === 3 ? 'Paused while travelling' : undefined,
        lastRunAt: completed > 0 ? daysAgo(randInt(1, 30)) : undefined,
        failureCount: 0,
      });
      instructionCount++;

      // One cancelled, so the history view is not empty.
      if (i % 4 === 0) {
        await StandingInstruction.create({
          reference: generateReference('SI'),
          customerId: customer._id,
          userId: customerUsers[i]._id,
          sourceAccountId: own[0]._id,
          beneficiaryId: payees[(i + 1) % payees.length]._id,
          nickname: 'Old subscription',
          amount: randInt(500, 2500),
          frequency: 'MONTHLY',
          dayOfMonth: 8,
          startDate: daysAgo(400),
          nextRunDate: daysAgo(30),
          runsCompleted: randInt(3, 10),
          totalDebited: randInt(2000, 20000),
          status: 'CANCELLED',
          cancelledAt: daysAgo(randInt(5, 60)),
          failureCount: 0,
        });
        instructionCount++;
      }
    }
    logger.info(`${instructionCount} standing instructions created`);

    // ------------------------------------------------------------ nominees
    const NOMINEE_RELATIONSHIPS = ['Spouse', 'Son', 'Daughter', 'Father', 'Mother', 'Brother', 'Sister'];
    let nomineeCount = 0;
    for (let i = 0; i < customers.length; i++) {
      const customer = customers[i];
      const own = accounts.filter((a) => String(a.customerId) === String(customer._id));
      if (!own.length) continue;

      const single = i % 3 === 0;
      const nominees = single
        ? [
            {
              name: `${PEOPLE[(i + 3) % PEOPLE.length].first} ${PEOPLE[(i + 3) % PEOPLE.length].last}`,
              relationship: NOMINEE_RELATIONSHIPS[i % NOMINEE_RELATIONSHIPS.length],
              sharePercentage: 100,
            },
          ]
        : [
            {
              name: `${PEOPLE[(i + 3) % PEOPLE.length].first} ${PEOPLE[(i + 3) % PEOPLE.length].last}`,
              relationship: NOMINEE_RELATIONSHIPS[i % NOMINEE_RELATIONSHIPS.length],
              sharePercentage: 60,
            },
            {
              name: `${PEOPLE[(i + 5) % PEOPLE.length].first} ${PEOPLE[(i + 5) % PEOPLE.length].last}`,
              relationship: NOMINEE_RELATIONSHIPS[(i + 2) % NOMINEE_RELATIONSHIPS.length],
              sharePercentage: 40,
            },
          ];

      for (const nominee of nominees) {
        await Nominee.create({
          customerId: customer._id,
          userId: customerUsers[i]._id,
          accountId: own[0]._id,
          accountNumber: own[0].accountNumber,
          name: nominee.name,
          relationship: nominee.relationship,
          dateOfBirth: new Date(1975 + ((i * 3) % 22), (i * 5) % 12, ((i * 7) % 27) + 1),
          address: addressFor(i + 3),
          mobile: indianPhone(200 + i),
          email: `${nominee.name.split(' ')[0].toLowerCase()}@mangaud.demo`,
          sharePercentage: nominee.sharePercentage,
          identityProof: 'Aadhaar',
          status: 'REGISTERED',
          registeredAt: daysAgo(randInt(30, 700)),
        });
        nomineeCount++;
      }
    }
    logger.info(`${nomineeCount} nominees registered`);

    // ---------------------------------------------------------------- KYC
    const OCCUPATIONS = [
      'Software Engineer',
      'Chartered Accountant',
      'Doctor',
      'Teacher',
      'Business Owner',
      'Civil Servant',
      'Architect',
      'Pharmacist',
    ];
    const SOURCES_OF_FUNDS = [
      'Salary from my employer',
      'Business income',
      'Investment returns and rent',
      'Sale of property',
      'Family business income',
    ];

    let kycCount = 0;
    for (let i = 0; i < customers.length; i++) {
      const customer = customers[i];
      const person = PEOPLE[i];
      const status = ['VERIFIED', 'VERIFIED', 'VERIFIED', 'VERIFIED', 'VERIFIED', 'UNDER_REVIEW', 'SUBMITTED', 'REJECTED'][i];

      const submittedAt = daysAgo(randInt(5, 300));
      const reviewed = ['VERIFIED', 'REJECTED'].includes(status);

      await KycSubmission.create({
        reference: generateReference('KYC'),
        customerId: customer._id,
        userId: customerUsers[i]._id,
        status,
        documents: [
          { type: 'AADHAAR', number: `XXXX XXXX ${1000 + i * 137}`.slice(-4), verified: reviewed && status === 'VERIFIED' },
          { type: 'PAN', number: person.pan, verified: reviewed && status === 'VERIFIED' },
          { type: 'ADDRESS_PROOF', verified: reviewed && status === 'VERIFIED' },
        ].filter((d) => d.type !== 'ADDRESS_PROOF' || i % 2 === 0),
        declared: {
          fullName: `${person.first} ${person.last}`,
          dateOfBirth: new Date(person.dob),
          address: person.address,
          occupation: OCCUPATIONS[i % OCCUPATIONS.length],
          annualIncome: randInt(8, 60) * 100000,
          sourceOfFunds: SOURCES_OF_FUNDS[i % SOURCES_OF_FUNDS.length],
          politicallyExposed: false,
        },
        addressProofType: i % 2 === 0 ? 'Aadhaar' : 'Passport',
        selfieVerified: true,
        submittedAt,
        reviewedBy: reviewed ? staffUsers[1]._id : undefined,
        reviewedByName: reviewed ? 'Sunita Rao' : undefined,
        reviewedAt: reviewed ? new Date(submittedAt.getTime() + 3 * 864e5) : undefined,
        decisionNotes:
          status === 'VERIFIED'
            ? 'Documents verified against source records.'
            : status === 'REJECTED'
              ? 'Aadhaar photograph was unclear. Please resubmit a clearer scan.'
              : undefined,
        rejectionReasons:
          status === 'REJECTED'
            ? ['Aadhaar image is not legible', 'Address proof does not match the declared address']
            : undefined,
        riskLevel: status === 'VERIFIED' ? 'LOW' : status === 'REJECTED' ? 'MEDIUM' : undefined,
        validUntil:
          status === 'VERIFIED' ? new Date(Date.now() + randInt(300, 700) * 864e5) : undefined,
      });
      kycCount++;
    }
    logger.info(`${kycCount} KYC submissions created`);

    // -------------------------------------------------------------- done
    const counts = {
      users: await User.countDocuments(),
      customers: await Customer.countDocuments(),
      accounts: await Account.countDocuments(),
      transactions: await Transaction.countDocuments(),
      loans: await Loan.countDocuments(),
      cards: await Card.countDocuments(),
      beneficiaries: await Beneficiary.countDocuments(),
      statements: await Statement.countDocuments(),
      notifications: await Notification.countDocuments(),
      auditEntries: await AuditLog.countDocuments(),
    };

    logger.info('---');
    logger.info(`Users              ${counts.users}`);
    logger.info(`Customers          ${counts.customers}`);
    logger.info(`Accounts           ${counts.accounts}`);
    logger.info(`Transactions       ${counts.transactions}`);
    logger.info(`Loans              ${counts.loans}`);
    logger.info(`Cards              ${counts.cards}`);
    logger.info(`Beneficiaries      ${counts.beneficiaries}`);
    logger.info(`Fixed deposits     ${depositCount}`);
    logger.info(`Standing instr.    ${instructionCount}`);
    logger.info(`Nominees           ${nomineeCount}`);
    logger.info(`KYC submissions    ${kycCount}`);
    logger.info(`Statements         ${counts.statements}`);
    logger.info(`Notifications      ${counts.notifications}`);
    logger.info(`Audit entries      ${counts.auditEntries}`);
    logger.info('---');
    logger.info('Demo logins — one per role, so RBAC can be exercised end to end:');
    logger.info('  Administrator     admin@mangaud.demo        / Admin@123');
    logger.info('  Branch Manager    manager@mangaud.demo      / Manager@123');
    logger.info('  Branch Teller     teller@mangaud.demo       / Teller@123');
    logger.info('  Loan Officer      loanofficer@mangaud.demo  / Officer@123');
    logger.info('  Auditor           auditor@mangaud.demo      / Auditor@123');
    logger.info('  Customer          aarav.sharma@mangaud.demo / Customer@123');
    logger.info('  Customer          priya.nair@mangaud.demo   / Customer@123');
    logger.info('  Customer          rohan.patel@mangaud.demo  / Customer@123');
    logger.info('  Customer          ananya.iyer@mangaud.demo  / Customer@123');
  } catch (error) {
    logger.error('Seeding error:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
  }
};

// Run only when invoked directly (`tsx src/scripts/seed.ts`).
// `pathToFileURL` is required because a raw path comparison never matches on
// Windows, where import.meta.url uses forward slashes and a leading slash.
const isDirectRun =
  !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  seedDatabase()
    .then(() => {
      console.log('Seed complete.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Seed failed:', error);
      process.exit(1);
    });
}

export default seedDatabase;
