import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../interfaces/auth.interface';
import AppError from '../utils/AppError';

export const restrictTo = (...roles: Array<'USER' | 'ADMIN' | 'SUPPORT'>) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(
        new AppError('You do not have permission to perform this action', 403)
      );
    }
    next();
  };
};

export default restrictTo;
