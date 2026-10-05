import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { IApiResponse } from '@shared/types';
import logger from '../utils/logger';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(message: string, statusCode: number = 500, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.details = details;

    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, details);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401);
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403);
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 409, details);
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let response: IApiResponse = {
    success: false,
    error: 'Internal server error',
  };

  let statusCode = 500;

  // A malformed JSON body is a client error, not a server fault. Without this
  // branch body-parser's SyntaxError fell through to a 500 "Internal server
  // error", which sent callers hunting for backend bugs.
  if (error instanceof SyntaxError && 'body' in error) {
    statusCode = 400;
    response = {
      success: false,
      error: 'Malformed JSON in request body',
    };
    logger.warn(`Malformed JSON body on ${req.method} ${req.originalUrl}`);
    res.status(400).json(response);
    return;
  }

  if (error instanceof AppError) {
    statusCode = error.statusCode;
    response.error = error.message;
    if (error.details) {
      response.data = error.details;
    }
  } else if (error instanceof ZodError) {
    statusCode = 400;
    response.error = 'Validation failed';
    response.data = {
      errors: error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    };
  } else if (error instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    response.error = 'Validation failed';
    response.data = {
      errors: Object.values(error.errors).map((e) => ({
        field: e.path,
        message: e.message,
      })),
    };
  } else if (error instanceof mongoose.Error.CastError) {
    statusCode = 400;
    response.error = 'Invalid ID format';
  } else if (error.name === 'MongoServerError' && (error as any).code === 11000) {
    statusCode = 409;
    const field = Object.keys((error as any).keyValue)[0];
    response.error = `${field} already exists`;
  } else if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    response.error = 'Invalid token';
  } else if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    response.error = 'Token expired';
  }

  if (statusCode >= 500) {
    response.error = 'Internal server error';
  }

  /*
   * Logged after the status is known, and at a level that matches it.
   *
   * A 403 or a 400 is the system working: a teller reaching for a permission
   * they do not have is an ordinary event. Logging each one at `error` with a
   * full stack buried the actual faults — one refused request produced forty
   * lines, and grepping the log for a real failure meant wading past them.
   * Only 5xx is a defect worth a stack trace; 4xx is one line, and the access
   * log already records the method, path and status.
   */
  const context = {
    message: error.message,
    path: req.path,
    method: req.method,
    ip: req.ip,
  };

  if (statusCode >= 500) {
    logger.error('Server error:', { ...context, stack: error.stack });
  } else if (statusCode >= 400) {
    logger.warn(`Rejected ${req.method} ${req.path} (${statusCode})`, context);
  }

  res.status(statusCode).json(response);
};

export const notFoundHandler = (req: Request, res: Response): void => {
  const response: IApiResponse = {
    success: false,
    error: `Route ${req.method} ${req.path} not found`,
  };
  res.status(404).json(response);
};

export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};