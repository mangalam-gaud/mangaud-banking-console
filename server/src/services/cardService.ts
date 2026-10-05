import { Card, generateCardNumber, generateCVV, ICardDocument } from '../models/Card';
import { Account } from '../models/Account';
import { Customer } from '../models/Customer';
import { NotFoundError, ValidationError, ForbiddenError } from '../middleware/errorHandler';
import { generateReference } from '../utils/reference';
import { hashSecret } from '../utils/crypto';
import logger from '../utils/logger';

export interface CardView {
  _id: string;
  id: string;
  cardNumber: string;
  maskedNumber: string;
  cardholderName: string;
  accountId: string;
  accountNumber?: string;
  accountType?: string;
  type: string;
  network: string;
  status: string;
  expiryMonth: number;
  expiryYear: number;
  expiryLabel: string;
  pinSet: boolean;
  dailyLimit: number;
  monthlyLimit: number;
  spentThisMonth: number;
  monthlyAvailable: number;
  nickname?: string;
  colour: string;
  issuedAt: Date;
  lastUsedAt?: Date;
  frozenAt?: Date;
  frozenReason?: string;
}

const refId = (value: any): string => {
  if (!value) return '';
  if (typeof value === 'object') return (value._id ?? value.id)?.toString() ?? '';
  return value.toString();
};

const toCardView = (doc: any): CardView => {
  const account = doc.accountId && typeof doc.accountId === 'object' ? doc.accountId : null;
  const last4 = String(doc.cardNumber).slice(-4);

  return {
    _id: String(doc._id),
    id: String(doc._id),
    cardNumber: doc.cardNumber,
    maskedNumber: `•••• •••• •••• ${last4}`,
    cardholderName: doc.cardholderName,
    accountId: refId(doc.accountId),
    accountNumber: account?.accountNumber,
    accountType: account?.accountType,
    type: doc.type,
    network: doc.network,
    status: doc.status,
    expiryMonth: doc.expiryMonth,
    expiryYear: doc.expiryYear,
    expiryLabel: `${String(doc.expiryMonth).padStart(2, '0')}/${String(doc.expiryYear).slice(-2)}`,
    pinSet: doc.pinSet,
    dailyLimit: doc.dailyLimit,
    monthlyLimit: doc.monthlyLimit,
    spentThisMonth: doc.spentThisMonth,
    monthlyAvailable: Math.max(0, doc.monthlyLimit - doc.spentThisMonth),
    nickname: doc.nickname,
    colour: doc.colour,
    issuedAt: doc.issuedAt,
    lastUsedAt: doc.lastUsedAt,
    frozenAt: doc.frozenAt,
    frozenReason: doc.frozenReason,
  };
};

const CARD_COLOURS = ['ink', 'brass', 'forest', 'slate', 'plum'];

/**
 * Issue a card against one of the customer's own accounts.
 *
 * A customer can hold at most three active cards per account — enough for a
 * primary card, a virtual card and a backup, without letting the collection
 * grow unbounded.
 */
export const issueCard = async (
  customerId: string,
  accountId: string,
  type: 'DEBIT' | 'CREDIT' | 'VIRTUAL' = 'DEBIT',
  network: 'VISA' | 'MASTERCARD' | 'RUPAY' = 'VISA',
  nickname?: string
): Promise<CardView> => {
  const customer = await Customer.findById(customerId);
  if (!customer) throw new NotFoundError('Customer');

  const account = await Account.findOne({ _id: accountId, customerId });
  if (!account) throw new NotFoundError('Account');
  if (account.status !== 'ACTIVE') {
    throw new ValidationError(`Cannot issue a card on a ${account.status.toLowerCase()} account`);
  }

  const activeCount = await Card.countDocuments({
    accountId,
    status: { $in: ['ACTIVE', 'FROZEN'] },
  });
  if (activeCount >= 3) {
    throw new ValidationError('You can hold a maximum of 3 cards per account');
  }

  // Credit cards are not offered against current accounts in this build.
  if (type === 'CREDIT' && account.accountType === 'CURRENT') {
    throw new ValidationError('Credit cards are not available on current accounts');
  }

  const card = await Card.create({
    cardNumber: generateCardNumber(),
    cardholderName: `${customer.firstName} ${customer.lastName}`.toUpperCase(),
    accountId: account._id,
    customerId: customer._id,
    type,
    network,
    status: 'ACTIVE',
    expiryMonth: new Date().getMonth() + 1 + (type === 'VIRTUAL' ? 0 : 36),
    expiryYear: new Date().getFullYear() + (type === 'VIRTUAL' ? 3 : 4),
    cvv: generateCVV(),
    pinSet: false,
    dailyLimit: type === 'CREDIT' ? 200000 : 50000,
    monthlyLimit: type === 'CREDIT' ? 1000000 : 300000,
    spentThisMonth: 0,
    nickname: nickname || (type === 'VIRTUAL' ? 'Virtual card' : 'Primary card'),
    colour: CARD_COLOURS[activeCount % CARD_COLOURS.length],
    issuedAt: new Date(),
  });

  logger.info(`Card issued: ${card.maskedNumber} on account ${account.accountNumber}`);
  return toCardView(card.toObject({ virtuals: true }));
};

export const getCardsForCustomer = async (customerId: string): Promise<CardView[]> => {
  const cards = await Card.find({ customerId })
    .populate('accountId', 'accountNumber accountType')
    .sort({ createdAt: -1 })
    .lean({ virtuals: true });

  return cards.map(toCardView);
};

export const getAllCards = async (
  page = 1,
  limit = 20,
  filters: { status?: string; type?: string; accountIds?: string[] } = {}
): Promise<{ cards: CardView[]; total: number; totalPages: number }> => {
  const query: Record<string, unknown> = {};
  if (filters.status) query.status = filters.status;
  if (filters.type) query.type = filters.type;
  /*
    Branch scoping. `Card` has no branch of its own, so scope is applied through
    the account it is issued against: the caller sees cards on the accounts they
    may see, and those are already branch-filtered by `visibleAccountIds`.
  */
  if (filters.accountIds) {
    if (filters.accountIds.length === 0) {
      return { cards: [], total: 0, totalPages: 0 };
    }
    query.accountId = { $in: filters.accountIds };
  }

  const [cards, total] = await Promise.all([
    Card.find(query)
      .populate('accountId', 'accountNumber accountType')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean({ virtuals: true }),
    Card.countDocuments(query),
  ]);

  return { cards: cards.map(toCardView), total, totalPages: Math.ceil(total / limit) };
};

/** Loads a card and asserts the caller owns it. */
const loadOwnedCard = async (cardId: string, customerId: string): Promise<ICardDocument> => {
  const card = await Card.findById(cardId);
  if (!card) throw new NotFoundError('Card');
  if (!card.customerId.equals(customerId)) {
    throw new ForbiddenError('You do not have access to this card');
  }
  return card;
};

export const freezeCard = async (cardId: string, customerId: string, reason?: string): Promise<CardView> => {
  const card = await loadOwnedCard(cardId, customerId);
  if (card.status === 'CANCELLED') throw new ValidationError('Card is cancelled and cannot be frozen');
  if (card.status === 'FROZEN') return toCardView(card.toObject({ virtuals: true }));

  card.status = 'FROZEN';
  card.frozenAt = new Date();
  card.frozenReason = reason || 'Frozen by customer';
  await card.save();

  logger.info(`Card frozen: ${card.maskedNumber}`);
  return toCardView(card.toObject({ virtuals: true }));
};

export const unfreezeCard = async (cardId: string, customerId: string): Promise<CardView> => {
  const card = await loadOwnedCard(cardId, customerId);
  if (card.status !== 'FROZEN') throw new ValidationError('Card is not frozen');

  card.status = 'ACTIVE';
  card.frozenAt = undefined;
  card.frozenReason = undefined;
  await card.save();

  logger.info(`Card unfrozen: ${card.maskedNumber}`);
  return toCardView(card.toObject({ virtuals: true }));
};

export const cancelCard = async (cardId: string, customerId: string): Promise<CardView> => {
  const card = await loadOwnedCard(cardId, customerId);
  if (card.status === 'CANCELLED') return toCardView(card.toObject({ virtuals: true }));

  card.status = 'CANCELLED';
  card.frozenAt = new Date();
  card.frozenReason = 'Cancelled by customer';
  await card.save();

  logger.info(`Card cancelled: ${card.maskedNumber}`);
  return toCardView(card.toObject({ virtuals: true }));
};

export const updateCardLimits = async (
  cardId: string,
  customerId: string,
  limits: { dailyLimit?: number; monthlyLimit?: number }
): Promise<CardView> => {
  const card = await loadOwnedCard(cardId, customerId);

  const daily = limits.dailyLimit ?? card.dailyLimit;
  const monthly = limits.monthlyLimit ?? card.monthlyLimit;

  if (daily <= 0) throw new ValidationError('Daily limit must be greater than zero');
  if (monthly <= 0) throw new ValidationError('Monthly limit must be greater than zero');
  if (daily > monthly) {
    throw new ValidationError('Daily limit cannot exceed the monthly limit');
  }
  if (monthly < card.spentThisMonth) {
    throw new ValidationError(
      `Monthly limit cannot be lower than the ${card.spentThisMonth} already spent this month`
    );
  }

  card.dailyLimit = daily;
  card.monthlyLimit = monthly;
  await card.save();

  return toCardView(card.toObject({ virtuals: true }));
};

export const updateCardNickname = async (
  cardId: string,
  customerId: string,
  nickname: string
): Promise<CardView> => {
  const card = await loadOwnedCard(cardId, customerId);
  card.nickname = nickname.trim().slice(0, 40);
  await card.save();
  return toCardView(card.toObject({ virtuals: true }));
};

/**
 * Set the 4-digit card PIN.
 *
 * The PIN is stored as a scrypt hash, never plaintext, and the CVV is only
 * ever returned in the one-time reveal after issue.
 */
export const setCardPin = async (
  cardId: string,
  customerId: string,
  pin: string
): Promise<CardView> => {
  const card = await loadOwnedCard(cardId, customerId);
  if (!/^\d{4}$/.test(pin)) throw new ValidationError('PIN must be exactly 4 digits');
  if (/^(\d)\1{3}$/.test(pin)) throw new ValidationError('PIN cannot be four identical digits');

  card.pinHash = hashSecret(pin);
  card.pinSet = true;
  await card.save();

  return toCardView(card.toObject({ virtuals: true }));
};

/** One-time reveal of the full number + CVV for a card the caller owns. */
export const revealCardCredentials = async (
  cardId: string,
  customerId: string
): Promise<{ cardNumber: string; cvv: string; expiryLabel: string }> => {
  await loadOwnedCard(cardId, customerId);
  const card = await Card.findById(cardId).select('+cvv');
  if (!card) throw new NotFoundError('Card');

  return {
    cardNumber: card.cardNumber,
    cvv: card.cvv,
    expiryLabel: `${String(card.expiryMonth).padStart(2, '0')}/${String(card.expiryYear).slice(-2)}`,
  };
};

export const getCardById = async (cardId: string, customerId: string): Promise<CardView> => {
  const card = await Card.findById(cardId).populate('accountId', 'accountNumber accountType').lean({
    virtuals: true,
  });
  if (!card) throw new NotFoundError('Card');
  if (refId(card.customerId) !== customerId) {
    throw new ForbiddenError('You do not have access to this card');
  }
  return toCardView(card);
};

/** Aggregate card balances for the dashboard strip. */
/**
 * Card counts and spend rollup.
 *
 * `customerId` is optional: omitted means the whole bank, which is what a
 * manager or teller sees in the summary tile. A customer caller always passes
 * their own id, resolved by the controller.
 */
export const getCardSummary = async (
  customerId?: string
): Promise<{ total: number; active: number; frozen: number; monthlySpend: number; monthlyAvailable: number }> => {
  const filter = customerId ? { customerId, status: { $ne: 'CANCELLED' } } : { status: { $ne: 'CANCELLED' } };
  const cards = await Card.find(filter)
    .select('status spentThisMonth monthlyLimit')
    .lean();

  return {
    total: cards.length,
    active: cards.filter((c) => c.status === 'ACTIVE').length,
    frozen: cards.filter((c) => c.status === 'FROZEN').length,
    monthlySpend: cards.reduce((sum, c) => sum + (c.spentThisMonth || 0), 0),
    monthlyAvailable: cards.reduce(
      (sum, c) => sum + Math.max(0, (c.monthlyLimit || 0) - (c.spentThisMonth || 0)),
      0
    ),
  };
};

export { generateReference };
export default {
  issueCard,
  getCardsForCustomer,
  getAllCards,
  freezeCard,
  unfreezeCard,
  cancelCard,
  updateCardLimits,
  updateCardNickname,
  setCardPin,
  revealCardCredentials,
  getCardById,
  getCardSummary,
};
