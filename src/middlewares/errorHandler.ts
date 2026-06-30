import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';
import AppError from '../utils/AppError';
import { env } from '../config/env';
import { Prisma } from '@prisma/client';

const handlePrismaError = (err: Prisma.PrismaClientKnownRequestError): AppError => {
  let message = 'Database error occurred';
  let statusCode = 400;

  switch (err.code) {
    case 'P2002':
      const fields = (err.meta?.target as string[]) || [];
      message = `Duplicate field value: ${fields.join(', ')}. Please use another value.`;
      break;
    case 'P2003':
      message = 'Foreign key constraint failed. Related record not found.';
      break;
    case 'P2025':
      message = 'The requested record was not found.';
      statusCode = 404;
      break;
    default:
      message = `Database operation failed: ${err.message}`;
  }

  return new AppError(message, statusCode);
};

const handleJWTError = (): AppError => 
  new AppError('Invalid token. Please log in again.', 401);

const handleJWTExpiredError = (): AppError => 
  new AppError('Your token has expired. Please log in again.', 401);

export const globalErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let error = { ...err };
  error.message = err.message;
  error.statusCode = err.statusCode || 500;
  error.status = err.status || 'error';

  logger.error(`Error details: ${err.message}`, { stack: err.stack });

  // Handle specific technical errors and convert them to operational ones
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    error = handlePrismaError(err);
  } else if (err.name === 'JsonWebTokenError') {
    error = handleJWTError();
  } else if (err.name === 'TokenExpiredError') {
    error = handleJWTExpiredError();
  }

  if (env.NODE_ENV === 'development') {
    res.status(error.statusCode).json({
      status: error.status,
      message: error.message,
      error: err,
      stack: err.stack,
    });
  } else {
    // Production Mode
    if (error.isOperational || err.isOperational) {
      res.status(error.statusCode).json({
        status: error.status,
        message: error.message,
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
