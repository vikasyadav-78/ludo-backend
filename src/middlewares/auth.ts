import { Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import userRepository from '../repositories/UserRepository';
import AppError from '../utils/AppError';
import catchAsync from '../utils/catchAsync';
import { AuthenticatedRequest } from '../interfaces/auth.interface';

export const protect = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    let token: string | undefined;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return next(new AppError('You are not logged in. Please log in to get access.', 401));
    }

    try {
      const decoded = verifyAccessToken(token);

      const currentUser = await userRepository.findById(decoded.userId);
      if (!currentUser) {
        return next(new AppError('The user belonging to this token no longer exists.', 401));
      }

      if (currentUser.status === 'SUSPENDED') {
        return next(new AppError('Your account has been suspended.', 403));
      }

      req.user = currentUser;
      next();
    } catch (err) {
      return next(new AppError('Invalid or expired token. Please log in again.', 401));
    }
  }
);
export default protect;
