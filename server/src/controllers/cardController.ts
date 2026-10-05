import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { IApiResponse } from '@shared/types';
import { getCustomerForUser, visibleAccountIds } from '../utils/ownership';
import { isStaffRole } from '../config/permissions';
import { Card } from '../models/Card';
import { Customer } from '../models/Customer';
import { NotFoundError } from '../middleware/errorHandler';
import * as cardService from '../services/cardService';
import * as auditService from '../services/auditService';
import * as notificationService from '../services/notificationService';

/**
 * Whose cards this request is about.
 *
 * For a customer, always themselves -- a `customerId` in the body is ignored
 * outright, so there is no path by which one customer can act on another's
 * cards.
 *
 * For staff, the owner of the card named in the path. This is the difference
 * between a teller's permission matrix working and not working: freezing the
 * card a customer has just lost is the teller's actual job, so holding
 * `card:freeze:any` has to be enough to act on someone else's card. Resolving
 * the *caller's* customer instead -- which is what this did originally -- made
 * every `:any` card permission unreachable for exactly the roles that hold it.
 */
const cardOwnerId = async (req: AuthRequest): Promise<string> => {
  if (!isStaffRole(req.user!.role)) {
    return (await getCustomerForUser(req.user!._id.toString()))._id.toString();
  }

  const card = await Card.findById(req.params.cardId).select('customerId').lean();
  if (!card) throw new NotFoundError('Card');
  return String(card.customerId);
};

/**
 * Whose cards a *collection* endpoint is about.
 *
 * A customer sees their own. Staff may pass `?customerId=` to scope the list, and
 * with no parameter see the whole bank.
 */
const collectionOwnerId = async (req: AuthRequest): Promise<string | null> => {
  if (!isStaffRole(req.user!.role)) {
    return (await getCustomerForUser(req.user!._id.toString()))._id.toString();
  }

  const requested = (req.query.customerId ?? req.body?.customerId) as string | undefined;
  if (!requested) return null;

  // Confirm the id is real before handing it to a service, so a typo is a 404
  // with a clear message rather than an empty result set.
  const exists = await Customer.exists({ _id: requested });
  if (!exists) throw new NotFoundError('Customer');
  return String(requested);
};

export const listCards = async (req: AuthRequest, res: Response): Promise<void> => {
  const ownerId = await collectionOwnerId(req);

  /*
    One response shape for both roles, which this did not have.

    `getCardsForCustomer` returns an array; `getAllCards` returns
    `{ cards, total, totalPages }`. Assigning whichever came back straight into
    `data.cards` meant the *same route* answered with an array for a customer and
    an object for staff — so the client, which does
    `setCards(cardsRes.data?.cards ?? [])` and then `.filter(...)`, worked for
    customers and threw `cards.filter is not a function` for every staff role.

    Normalised here rather than in the client, because a route whose shape depends
    on the caller's role is the defect; the client cannot be expected to know
    which of the two it got.
  */
  const result = ownerId
    ? { cards: await cardService.getCardsForCustomer(ownerId) }
    : // Bank-wide for head office; branch-scoped for everyone else, via the
      // accounts the caller may see. Unscoped, this list exposed every card in
      // the bank to a teller at one branch.
      await cardService.getAllCards(1, 100, {
        accountIds: (await visibleAccountIds(req.user!)).map(String),
      });

  const response: IApiResponse = {
    success: true,
    data: {
      cards: result.cards ?? [],
      total: 'total' in result ? result.total : result.cards.length,
      totalPages: 'totalPages' in result ? result.totalPages : 1,
    },
  };
  res.json(response);
};

export const cardSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  // Bank-wide summary for staff, the customer's own rollup for a customer.
  const summary = isStaffRole(req.user!.role)
    ? await cardService.getCardSummary()
    : await cardService.getCardSummary((await getCustomerForUser(req.user!._id.toString()))._id.toString());

  const response: IApiResponse = { success: true, data: { summary } };
  res.json(response);
};

export const issueCard = async (req: AuthRequest, res: Response): Promise<void> => {
  const ownerId = await collectionOwnerId(req);
  if (!ownerId) {
    throw new NotFoundError('Customer');
  }
  const { accountId, type = 'DEBIT', network = 'VISA', nickname } = req.body;

  const card = await cardService.issueCard(
    ownerId,
    accountId,
    type,
    network,
    nickname
  );

  // The full number + CVV are only ever returned here, once.
  const credentials = await cardService.revealCardCredentials(card.id, ownerId);

  await auditService.recordAudit(req, {
    action: 'CARD_ISSUE',
    entity: 'card',
    entityId: card.id,
    message: `Issued ${type.toLowerCase()} card on ${card.accountNumber}`,
    metadata: { type, network, issuedOnBehalfOf: ownerId },
  });

  // The card belongs to the customer, not to the employee who issued it, so the
  // "your new card is ready" notification has to go to the owner's user record.
  const owner = await Customer.findById(ownerId).select('userId').lean();

  await notificationService.notify({
    userId: String(owner!.userId),
    customerId: ownerId,
    category: 'card',
    title: 'New card issued',
    body: `${card.maskedNumber} is ready to use`,
    link: '/cards',
    referenceId: `card-issued:${card.id}`,
  });

  const response: IApiResponse = {
    success: true,
    message: 'Card issued successfully',
    data: { card, credentials },
  };
  res.status(201).json(response);
};

export const getCard = async (req: AuthRequest, res: Response): Promise<void> => {
  const customerId = await cardOwnerId(req);
  const card = await cardService.getCardById(req.params.cardId, customerId);

  const response: IApiResponse = { success: true, data: { card } };
  res.json(response);
};

export const freezeCard = async (req: AuthRequest, res: Response): Promise<void> => {
  const customerId = await cardOwnerId(req);
  const card = await cardService.freezeCard(
    req.params.cardId,
    customerId,
    req.body?.reason
  );

  await auditService.recordAudit(req, {
    action: 'CARD_FREEZE',
    entity: 'card',
    entityId: card.id,
    message: `Card ${card.maskedNumber} frozen`,
  });

  // Goes to the card *owner*, not the caller. A teller freezing a customer's
  // card must still notify the customer -- that is the whole reason a freeze
  // notification exists.
  const owner = await Customer.findById(customerId).select('userId').lean();
  await notificationService.notifySecurity({
    userId: String(owner!.userId),
    title: 'Card frozen',
    body: `${card.maskedNumber} was frozen. Unfreeze it any time from the Cards page.`,
    referenceId: `card-frozen:${card.id}:${card.frozenAt}`,
  });

  const response: IApiResponse = { success: true, message: 'Card frozen', data: { card } };
  res.json(response);
};

export const unfreezeCard = async (req: AuthRequest, res: Response): Promise<void> => {
  const customerId = await cardOwnerId(req);
  const card = await cardService.unfreezeCard(req.params.cardId, customerId);

  await auditService.recordAudit(req, {
    action: 'CARD_UNFREEZE',
    entity: 'card',
    entityId: card.id,
    message: `Card ${card.maskedNumber} unfrozen`,
  });

  const response: IApiResponse = { success: true, message: 'Card unfrozen', data: { card } };
  res.json(response);
};

export const cancelCard = async (req: AuthRequest, res: Response): Promise<void> => {
  const customerId = await cardOwnerId(req);
  const card = await cardService.cancelCard(req.params.cardId, customerId);

  await auditService.recordAudit(req, {
    action: 'CARD_CANCEL',
    entity: 'card',
    entityId: card.id,
    message: `Card ${card.maskedNumber} cancelled`,
  });

  const response: IApiResponse = { success: true, message: 'Card cancelled', data: { card } };
  res.json(response);
};

export const setCardLimits = async (req: AuthRequest, res: Response): Promise<void> => {
  const customerId = await cardOwnerId(req);
  const card = await cardService.updateCardLimits(req.params.cardId, customerId, {
    dailyLimit: req.body?.dailyLimit,
    monthlyLimit: req.body?.monthlyLimit,
  });

  await auditService.recordAudit(req, {
    action: 'CARD_LIMITS_UPDATE',
    entity: 'card',
    entityId: card.id,
    metadata: { dailyLimit: card.dailyLimit, monthlyLimit: card.monthlyLimit },
  });

  const response: IApiResponse = { success: true, message: 'Limits updated', data: { card } };
  res.json(response);
};

export const renameCard = async (req: AuthRequest, res: Response): Promise<void> => {
  const customerId = await cardOwnerId(req);
  const card = await cardService.updateCardNickname(
    req.params.cardId,
    customerId,
    req.body?.nickname || ''
  );

  const response: IApiResponse = { success: true, message: 'Card renamed', data: { card } };
  res.json(response);
};

export const setCardPin = async (req: AuthRequest, res: Response): Promise<void> => {
  const customerId = await cardOwnerId(req);
  const card = await cardService.setCardPin(
    req.params.cardId,
    customerId,
    String(req.body?.pin || '')
  );

  // Deliberately no audit metadata for the PIN value itself.
  await auditService.recordAudit(req, {
    action: 'CARD_PIN_SET',
    entity: 'card',
    entityId: card.id,
    message: 'Card PIN updated',
  });

  const response: IApiResponse = { success: true, message: 'PIN updated', data: { card } };
  res.json(response);
};

export const revealCard = async (req: AuthRequest, res: Response): Promise<void> => {
  const customerId = await cardOwnerId(req);
  const credentials = await cardService.revealCardCredentials(
    req.params.cardId,
    customerId
  );

  await auditService.recordAudit(req, {
    action: 'CARD_DETAILS_REVEAL',
    entity: 'card',
    entityId: req.params.cardId,
    message: 'Full card number viewed',
  });

  const response: IApiResponse = { success: true, data: { credentials } };
  res.json(response);
};

export const listAllCards = async (req: AuthRequest, res: Response): Promise<void> => {
  const { page = 1, limit = 20, status, type } = req.query;
  const pageNum = parseInt(page as string, 10);
  const limitNum = parseInt(limit as string, 10);

  const result = await cardService.getAllCards(pageNum, limitNum, {
    status: status as string,
    type: type as string,
  });

  const response: IApiResponse = {
    success: true,
    data: { cards: result.cards },
    meta: { page: pageNum, limit: limitNum, total: result.total, totalPages: result.totalPages },
  };
  res.json(response);
};
