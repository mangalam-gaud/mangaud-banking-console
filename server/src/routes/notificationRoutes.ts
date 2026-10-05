import { Router } from 'express';
import {
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
  removeNotification,
  clearRead,
} from '../controllers/notificationController';
import { authenticate } from '../middleware/auth';
import { validateParams, validateQuery } from '../middleware/validation';
import { notificationIdParamSchema, notificationsQuerySchema } from '../validators/schemas';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

router.use(authenticate);

/*
 * Scoped by `req.user._id` in the controller rather than by a permission gate.
 *
 * That is what makes this router correct for every role: a caller can only ever
 * address their own notifications, because the id comes from their own session
 * and never from the request body. `notification:read:own` therefore has nothing
 * to add here -- it exists in the matrix because the client needs it to decide
 * whether to render the bell at all. The comment is here so the absence of a
 * gate does not read as an oversight on the next pass.
 *
 * Note the previous `GET /read-all`, which was wired to `listNotifications`:
 * the path promised to mark everything read and instead returned a list. The
 * client's "mark all read" button posts to `/mark-all-read`, so nothing called
 * the broken route, but a route whose handler contradicts its own name is a trap
 * for the next caller. Removed rather than aliased.
 */
router.get('/unread-count', asyncHandler(unreadCount));
router.post('/mark-all-read', asyncHandler(markAllRead));
router.post(
  '/:notificationId/read',
  validateParams(notificationIdParamSchema),
  asyncHandler(markRead)
);
router.delete('/clear-read', asyncHandler(clearRead));
router.delete(
  '/:notificationId',
  validateParams(notificationIdParamSchema),
  asyncHandler(removeNotification)
);
router.get('/', validateQuery(notificationsQuerySchema), asyncHandler(listNotifications));

export default router;