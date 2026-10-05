import { Router } from 'express';
import {
  listCards,
  cardSummary,
  issueCard,
  getCard,
  freezeCard,
  unfreezeCard,
  cancelCard,
  setCardLimits,
  renameCard,
  setCardPin,
  revealCard,
  listAllCards,
} from '../controllers/cardController';
import { authenticate } from '../middleware/auth';
import { requirePermission, requireAnyPermission } from '../middleware/rbac';
import { asyncHandler } from '../middleware/errorHandler';
import { validateBody, validateParams } from '../middleware/validation';
import { cardIdParamSchema, issueCardSchema, cardLimitsSchema, cardPinSchema, renameCardSchema } from '../validators/schemas';

const router = Router();

router.use(authenticate);

/**
 * Static segments must be declared before `/:cardId`, otherwise "all" and
 * "summary" would be read as card ids.
 *
 * A `teller` may issue and freeze a card on a customer's behalf
 * (`card:issue:any`) but may not cancel one or change its limits
 * (`card:cancel:any` / `card:limits:any` are manager-and-above). That
 * asymmetry is the point of gating on permissions rather than roles.
 */
router.get('/summary', requireAnyPermission('card:read:own', 'card:read:any'), asyncHandler(cardSummary));
router.get('/all', requirePermission('card:read:any'), asyncHandler(listAllCards));
router.get('/', requireAnyPermission('card:read:own', 'card:read:any'), asyncHandler(listCards));
router.post('/', requireAnyPermission('card:issue:own', 'card:issue:any'), validateBody(issueCardSchema), asyncHandler(issueCard));
router.get('/:cardId', requireAnyPermission('card:read:own', 'card:read:any'), validateParams(cardIdParamSchema), asyncHandler(getCard));
router.post('/:cardId/freeze', requireAnyPermission('card:freeze:own', 'card:freeze:any'), validateParams(cardIdParamSchema), asyncHandler(freezeCard));
router.post('/:cardId/unfreeze', requireAnyPermission('card:freeze:own', 'card:freeze:any'), validateParams(cardIdParamSchema), asyncHandler(unfreezeCard));
router.post('/:cardId/cancel', requireAnyPermission('card:cancel:own', 'card:cancel:any'), validateParams(cardIdParamSchema), asyncHandler(cancelCard));
router.patch('/:cardId/limits', requireAnyPermission('card:limits:own', 'card:limits:any'), validateParams(cardIdParamSchema), validateBody(cardLimitsSchema), asyncHandler(setCardLimits));
router.patch('/:cardId/nickname', requireAnyPermission('card:limits:own', 'card:limits:any'), validateParams(cardIdParamSchema), validateBody(renameCardSchema), asyncHandler(renameCard));
router.post('/:cardId/pin', requireAnyPermission('card:limits:own', 'card:limits:any'), validateParams(cardIdParamSchema), validateBody(cardPinSchema), asyncHandler(setCardPin));
router.get('/:cardId/reveal', requireAnyPermission('card:read:own', 'card:read:any'), validateParams(cardIdParamSchema), asyncHandler(revealCard));

export default router;