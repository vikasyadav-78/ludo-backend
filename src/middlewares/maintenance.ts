import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { systemSettingsCache } from '../modules/system-settings/SystemSettingsCache';
import AppError from '../utils/AppError';

export const checkMaintenance = (req: Request, res: Response, next: NextFunction) => {
  const isMaintenance = systemSettingsCache.getBoolean('MAINTENANCE_MODE', false);

  if (isMaintenance) {
    // 1. Bypass check for admin routes
    if (req.originalUrl.startsWith('/api/v1/admin')) {
      return next();
    }

    // 2. Bypass check for health check route
    if (req.originalUrl === '/health' || req.originalUrl === '/api/v1/health') {
      return next();
    }

    // 3. Bypass check if user is already authenticated and has ADMIN or SUPPORT role
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, env.JWT_SECRET) as any;
        if (decoded.role === 'ADMIN' || decoded.role === 'SUPPORT') {
          return next();
        }
      } catch (e) {
        // Treat as unauthenticated and block
      }
    }

    // Block player endpoints
    return next(new AppError('System is under maintenance. Please try again later.', 503));
  }

  next();
};
export default checkMaintenance;
