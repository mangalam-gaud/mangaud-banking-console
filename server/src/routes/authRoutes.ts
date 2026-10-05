import { Router } from 'express';
import {
  register, login, logout, refreshToken, getProfile, getPermissions, updateProfile,
  changePassword, forgotPassword, resetPassword,
} from '../controllers/authController';
import { authenticate } from '../middleware/auth';
import { validate, validateBody } from '../middleware/validation';
import { registerSchema, loginSchema, refreshTokenSchema, changePasswordSchema, forgotPasswordSchema, resetPasswordSchema, updateProfileSchema } from '../validators/schemas';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

router.post('/register', validateBody(registerSchema), asyncHandler(register));
router.post('/login', validateBody(loginSchema), asyncHandler(login));
router.post('/logout', authenticate, asyncHandler(logout));
router.post('/refresh', validateBody(refreshTokenSchema), asyncHandler(refreshToken));
router.get('/profile', authenticate, asyncHandler(getProfile));
router.get('/permissions', authenticate, asyncHandler(getPermissions));
router.put('/profile', authenticate, validateBody(updateProfileSchema), asyncHandler(updateProfile));
router.put('/change-password', authenticate, validateBody(changePasswordSchema), asyncHandler(changePassword));
router.post('/forgot-password', validateBody(forgotPasswordSchema), asyncHandler(forgotPassword));
router.post('/reset-password', validateBody(resetPasswordSchema), asyncHandler(resetPassword));

export default router;