import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config';
import { User } from '../models/User';
import { IUserDocument } from '../models/User';

export interface AuthRequest extends Request {
  user?: IUserDocument;
  token?: string;
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token: string | undefined;

    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    // `algorithms` is pinned rather than left to the library's default, so a
    // token presented with a substituted algorithm is rejected rather than
    // verified. This is the one check every authenticated request passes
    // through, so it is the right place to close that off.
    const decoded = jwt.verify(token, config.jwt.accessSecret, {
      algorithms: ['HS256'],
    }) as { id: string };
    const user = await User.findById(decoded.id).select('-password');

    if (!user || !user.isActive) {
      res.status(401).json({
        success: false,
        error: 'User not found or inactive',
      });
      return;
    }

    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        error: 'Token expired',
      });
      return;
    }
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        success: false,
        error: 'Invalid token',
      });
      return;
    }
    next(error);
  }
};
