import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';
import AppError from '../utils/AppError';
import { env } from '../config/env';

export const globalErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  logger.error(`Error details: ${err.message}`, { stack: err.stack });

  if (env.NODE_ENV === 'development') {
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
      error: err,
      stack: err.stack,
    });
  } else {
    // Production Mode
    if (err.isOperational) {
      res.status(err.statusCode).json({
        status: err.status,
        message: err.message,
      });
    } else {
      // Programming/unknown errors: don't leak details
      res.status(500).json({
        status: 'error',
        message: 'Something went wrong on the server',
      });
    }
  }
};

export default globalErrorHandler;
