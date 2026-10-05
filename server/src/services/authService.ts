import jwt, { SignOptions } from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { Types } from 'mongoose';
import config from '../config';
import { User } from '../models/User';
import { RefreshToken, PasswordResetToken } from '../models/index';
import { AppError, UnauthorizedError } from '../middleware/errorHandler';
import logger from '../utils/logger';

/** How long a password-reset token stays usable. Must match its JWT expiry. */
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * The only signing algorithm this app uses.
 *
 * `jsonwebtoken` picks the algorithm from the key type when `algorithms` is
 * omitted, and accepts whatever the library considers valid for an HMAC secret.
 * Pinning it closes the door on algorithm-substitution tokens presented at
 * `authenticate`, which is the one place every request passes through.
 */
const ALG: jwt.Algorithm = 'HS256';

export interface TokenPayload {
  id: string;
  email: string;
  role: string;
  /**
   * Unique token id. Required: without it, signing the same payload twice
   * within the same second produces a byte-identical JWT, and the unique index
   * on RefreshToken.token rejects the second login with "token already exists".
   */
  jti?: string;
  /**
   * The `_id` of the RefreshToken document this token pair belongs to.
   * Lets a request identify which of a user's sessions it came from.
   */
  sid?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiry: Date;
  refreshTokenExpiry: Date;
}

/**
 * Parse a `15m` / `7d` / `30s` / `2h` duration into milliseconds.
 *
 * Exported because the cookie lifetimes have to agree with the token lifetimes:
 * they were previously hard-coded to 15 minutes and 7 days while the durations
 * came from config, so changing `JWT_ACCESS_EXPIRY` silently desynchronised the
 * cookie from the JWT it was carrying.
 */
export const expiryToMs = (expiry: string): number => {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) return 15 * 60 * 1000;

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return 15 * 60 * 1000;
  }
};

const generateTokens = (user: any, sessionId: string): AuthTokens => {
  const basePayload: TokenPayload = {
    id: user._id.toString(),
    email: user.email,
    role: user.role,
  };

  // A per-issued-token id. JWTs are deterministic over (payload, secret), so
  // two logins in the same second would otherwise produce identical refresh
  // tokens and collide on the unique index.
  //
  // `sid` ties both tokens to the stored refresh-token document. Without it
  // there is no way to tell which of a user's sessions the current request is
  // coming from -- the access token is not the refresh token, so comparing
  // them always fails and "this device" is never flagged.
  const accessPayload: TokenPayload = { ...basePayload, jti: randomUUID(), sid: sessionId };
  const refreshPayload: TokenPayload = { ...basePayload, jti: randomUUID(), sid: sessionId };

  const accessOptions: SignOptions = { algorithm: ALG, expiresIn: config.jwt.accessExpiry as any };
  const refreshOptions: SignOptions = { algorithm: ALG, expiresIn: config.jwt.refreshExpiry as any };

  const accessToken = jwt.sign(accessPayload, config.jwt.accessSecret, accessOptions);
  const refreshToken = jwt.sign(refreshPayload, config.jwt.refreshSecret, refreshOptions);

  const accessTokenExpiry = new Date(Date.now() + expiryToMs(config.jwt.accessExpiry));
  const refreshTokenExpiry = new Date(Date.now() + expiryToMs(config.jwt.refreshExpiry));

  return {
    accessToken,
    refreshToken,
    accessTokenExpiry,
    refreshTokenExpiry,
  };
};

export const createTokens = async (user: any): Promise<AuthTokens> => {
  // Create the session row first so its id can be embedded in both tokens.
  const session = await RefreshToken.create({
    userId: user._id,
    token: 'pending',
    expiresAt: new Date(Date.now() + expiryToMs(config.jwt.refreshExpiry)),
  });

  const tokens = generateTokens(user, session._id.toString());
  session.token = tokens.refreshToken;
  await session.save();

  user.lastLoginAt = new Date();
  await user.save();

  logger.info(`Tokens created for user: ${user.email}`);
  return tokens;
};

export const refreshAccessToken = async (refreshToken: string): Promise<AuthTokens> => {
  try {
    const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret, {
      algorithms: [ALG],
    }) as TokenPayload;

    const storedToken = await RefreshToken.findOne({ token: refreshToken });
    if (!storedToken || storedToken.expiresAt < new Date()) {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) {
      throw new UnauthorizedError('User not found or inactive');
    }

    // Rotate in place, keeping the same session id. Deleting and re-creating the
    // row would give the device a new id on every refresh, so "this device"
    // would never stay flagged in the sessions list.
    const tokens = generateTokens(user, String(storedToken._id));
    storedToken.token = tokens.refreshToken;
    await storedToken.save();

    return tokens;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Refresh token expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError('Invalid refresh token');
    }
    throw error;
  }
};

/**
 * Revoke one session, given the access token the request arrived with.
 *
 * The access token is not the stored refresh token, so deleting by token value
 * matched nothing -- logout reported success while leaving the session alive
 * until its TTL. The `sid` claim carries the RefreshToken row's `_id`, which is
 * what actually identifies the session, so resolve through that instead.
 */
export const revokeSessionFromAccessToken = async (accessToken: string): Promise<boolean> => {
  let sid: string | undefined;
  try {
    const decoded = jwt.verify(accessToken, config.jwt.accessSecret, {
      algorithms: [ALG],
    }) as TokenPayload;
    sid = decoded.sid;
  } catch {
    return false;
  }
  if (!sid) return false;

  const result = await RefreshToken.deleteOne({ _id: sid });
  logger.info(`Refresh token revoked for session ${sid} (${result.deletedCount} deleted)`);
  return result.deletedCount > 0;
};

export const revokeRefreshToken = async (refreshToken: string): Promise<void> => {
  await RefreshToken.deleteOne({ token: refreshToken });
  logger.info('Refresh token revoked');
};

export const revokeAllUserTokens = async (userId: string): Promise<void> => {
  const result = await RefreshToken.deleteMany({ userId });
  logger.info(`All tokens revoked for user: ${userId} (${result.deletedCount})`);
};

export const verifyAccessToken = (token: string): TokenPayload => {
  return jwt.verify(token, config.jwt.accessSecret, { algorithms: [ALG] }) as TokenPayload;
};

/**
 * Mint a single-use password-reset token.
 *
 * Previously this was a bare JWT with a 1h expiry and no server-side record,
 * which meant a leaked token stayed replayable for the whole hour. It is now
 * backed by a `PasswordResetToken` row so `verifyResetToken` can consume it:
 * the row is deleted on use and Mongo's TTL index clears any that are never
 * used.
 */
export const generateResetToken = async (userId: string): Promise<string> => {
  const jti = randomUUID();
  const token = jwt.sign({ id: userId, type: 'password-reset', jti }, config.jwt.accessSecret, {
    algorithm: ALG,
    expiresIn: '1h' as any,
  });

  await PasswordResetToken.create({
    userId: new Types.ObjectId(userId),
    jti,
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
  });

  return token;
};

/**
 * Verify and consume a reset token.
 *
 * Single-use: the row is deleted before this returns, so a replay of the same
 * token finds nothing and is rejected.
 */
export const verifyResetToken = async (token: string): Promise<{ id: string }> => {
  const decoded = jwt.verify(token, config.jwt.accessSecret, {
    algorithms: [ALG],
  }) as { id: string; type: string; jti?: string };

  if (decoded.type !== 'password-reset') {
    throw new UnauthorizedError('Invalid reset token');
  }

  // No jti means the token predates this change, or was minted without a
  // backing row. Either way it cannot be single-use, so refuse it.
  if (!decoded.jti) {
    throw new UnauthorizedError('Invalid reset token');
  }

  const record = await PasswordResetToken.findOneAndDelete({ jti: decoded.jti });
  if (!record) {
    throw new UnauthorizedError('Reset token has already been used or has expired');
  }

  return { id: decoded.id };
};