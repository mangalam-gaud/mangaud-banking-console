import { Response } from 'express';
import { User, IUserDocument } from '../models/User';
import config from '../config';
import {
  createTokens,
  refreshAccessToken,
  revokeRefreshToken,
  revokeSessionFromAccessToken,
  revokeAllUserTokens,
  generateResetToken,
  verifyResetToken,
  expiryToMs,
} from '../services/authService';
import { AppError, UnauthorizedError, ValidationError, NotFoundError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import {
  ROLES,
  ROLE_LABELS,
  permissionsForRole,
  isStaffRole,
  type Role,
} from '../config/permissions';
import logger from '../utils/logger';
import { IApiResponse } from '@shared/types';

const setTokenCookies = (res: Response, accessToken: string, refreshToken: string, rememberMe: boolean): void => {
  // Derived from config rather than hard-coded, so the cookie and the JWT it
  // carries always expire together. `rememberMe` extends the refresh cookie only
  // -- the access token's lifetime is a server-side decision, not a client one.
  const accessExpiry = new Date(Date.now() + expiryToMs(config.jwt.accessExpiry));
  const refreshMs = rememberMe ? 30 * 24 * 60 * 60 * 1000 : expiryToMs(config.jwt.refreshExpiry);
  const refreshExpiry = new Date(Date.now() + refreshMs);

  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: accessExpiry,
  });

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: refreshExpiry,
  });
};

const clearTokenCookies = (res: Response): void => {
  res.clearCookie('accessToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
};

export const register = async (req: AuthRequest, res: Response): Promise<void> => {
  const { firstName, lastName, email, phone, password } = req.body;

  const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
  if (existingUser) {
    throw new ValidationError('User with this email or phone already exists');
  }

  const user = await User.create({
    firstName,
    lastName,
    email,
    phone,
    password,
  });

  const tokens = await createTokens(user);

  setTokenCookies(res, tokens.accessToken, tokens.refreshToken, false);

  const response: IApiResponse = {
    success: true,
    message: 'Registration successful',
    data: {
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    },
  };

  res.status(201).json(response);
};

export const login = async (req: AuthRequest, res: Response): Promise<void> => {
  const { email, password, rememberMe } = req.body;

  const user = await User.findOne({ email }).select('+password') as IUserDocument | null;
  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  if (!user.isActive) {
    throw new UnauthorizedError('Account is deactivated');
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const tokens = await createTokens(user);

  setTokenCookies(res, tokens.accessToken, tokens.refreshToken, rememberMe);

  const response: IApiResponse = {
    success: true,
    message: 'Login successful',
    data: {
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    },
  };

  res.json(response);
};

export const logout = async (req: AuthRequest, res: Response): Promise<void> => {
  /*
   * Revoke the session server-side, not just the cookie.
   *
   * This used to call `revokeRefreshToken(req.token)`, but `req.token` is the
   * *access* token and the stored rows hold *refresh* tokens. The delete matched
   * nothing, so signing out cleared the cookie while the session stayed valid
   * server-side until its TTL -- a captured refresh token kept working after the
   * user believed they had signed out. Resolve through the `sid` claim instead,
   * and fall back to the refresh cookie for the case where the access token has
   * already expired.
   */
  let revoked = false;
  if (req.token) {
    revoked = await revokeSessionFromAccessToken(req.token);
  }
  if (!revoked && req.cookies?.refreshToken) {
    await revokeRefreshToken(req.cookies.refreshToken);
    revoked = true;
  }

  clearTokenCookies(res);

  const response: IApiResponse = {
    success: true,
    message: 'Logged out successfully',
  };

  res.json(response);
};

export const refreshToken = async (req: AuthRequest, res: Response): Promise<void> => {
  const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
  
  if (!refreshToken) {
    throw new UnauthorizedError('Refresh token required');
  }

  const tokens = await refreshAccessToken(refreshToken);

  setTokenCookies(res, tokens.accessToken, tokens.refreshToken, false);

  const response: IApiResponse = {
    success: true,
    message: 'Token refreshed successfully',
    data: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    },
  };

  res.json(response);
};

export const getProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user!;

  const response: IApiResponse = {
    success: true,
    data: {
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        roleLabel: ROLE_LABELS[user.role as Role] ?? user.role,
        branchCode: user.branchCode,
        isEmailVerified: user.isEmailVerified,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
      },
      // The permission list travels with the profile so the client can hide
      // what the user cannot do, instead of hard-coding role checks that drift
      // away from the server's own rules.
      permissions: permissionsForRole(user.role),
    },
  };

  res.json(response);
};

/**
 * Permissions only, for a client that already has the profile cached.
 * Separate from `/profile` so the app can re-read them after a role change
 * without a second full profile round-trip.
 */
export const getPermissions = async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user!;
  const response: IApiResponse = {
    success: true,
    data: {
      role: user.role,
      roleLabel: ROLE_LABELS[user.role as Role] ?? user.role,
      // The branch is only meaningful for staff, but sending it unconditionally
      // saves the client a special case when it renders a "you are acting at
      // BLR001" badge.
      branchCode: user.branchCode,
      // Lets the client decide between the customer and staff shells without
      // re-deriving it from a hard-coded role list.
      isStaff: isStaffRole(user.role),
      permissions: permissionsForRole(user.role),
      allRoles: ROLES.map((role) => ({ role, label: ROLE_LABELS[role] })),
    },
  };
  res.json(response);
};

export const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  const { firstName, lastName, phone, address, dateOfBirth } = req.body;
  const user = req.user!;

  if (firstName) user.firstName = firstName;
  if (lastName) user.lastName = lastName;
  if (phone) user.phone = phone;
  
  await user.save();

  const response: IApiResponse = {
    success: true,
    message: 'Profile updated successfully',
    data: {
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    },
  };

  res.json(response);
};

export const changePassword = async (req: AuthRequest, res: Response): Promise<void> => {
  const { currentPassword, newPassword } = req.body;
  const user = req.user!;

  const userWithPassword = await User.findById(user._id).select('+password') as IUserDocument | null;
  if (!userWithPassword) {
    throw new NotFoundError('User');
  }

  const isMatch = await userWithPassword.comparePassword(currentPassword);
  if (!isMatch) {
    throw new UnauthorizedError('Current password is incorrect');
  }

  userWithPassword.password = newPassword;
  await userWithPassword.save();

  // Changing a password is the response to "I think someone has it". Every
  // existing session must die with it -- otherwise the attacker's refresh token
  // keeps working for up to 30 days and the change achieves nothing. This also
  // signs out the current device, so the client is sent back to /login.
  await revokeAllUserTokens(user._id.toString());
  clearTokenCookies(res);

  const response: IApiResponse = {
    success: true,
    message: 'Password changed successfully. Please sign in again.',
  };

  res.json(response);
};

export const forgotPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  const { email } = req.body;

  const user = await User.findOne({ email });
  if (!user) {
    const response: IApiResponse = {
      success: true,
      message: 'If the email exists, a reset link will be sent',
    };
    res.json(response);
    return;
  }

  const resetToken = await generateResetToken(user._id.toString());

  logger.info(`Password reset token generated for user: ${email}`);

  const response: IApiResponse = {
    success: true,
    message: 'If the email exists, a reset link will be sent',
    // Development convenience only: there is no mail transport wired up, so the
    // token is handed back for the reset page to use. Never in production.
    data: process.env.NODE_ENV === 'development' ? { resetToken } : undefined,
  };

  res.json(response);
};

export const resetPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  const { token, newPassword } = req.body;

  // Consumes the token: a second use of the same token finds no row and fails.
  const { id } = await verifyResetToken(token);

  const user = await User.findById(id);
  if (!user) {
    throw new ValidationError('Invalid or expired reset token');
  }

  user.password = newPassword;
  await user.save();

  // Same reasoning as changePassword: if the password was reset because it may
  // have been compromised, every existing session has to go.
  await revokeAllUserTokens(user._id.toString());

  const response: IApiResponse = {
    success: true,
    message: 'Password reset successful',
  };

  res.json(response);
};