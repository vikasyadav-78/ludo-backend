import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../interfaces/auth.interface';
import { Request } from 'express';
import { systemSettingsService } from './SystemSettingsService';
import catchAsync from '../../utils/catchAsync';

export const getSettings = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const settings = await systemSettingsService.getAdminSettings();
  res.status(200).json({
    status: 'success',
    data: { settings },
  });
});

export const updateSettings = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const adminId = req.user!.id;
  const adminName = req.user!.name;
  const ipAddress = req.ip || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';

  const updatedSettings = await systemSettingsService.updateSettings(
    req.body,
    adminId,
    adminName,
    ipAddress,
    userAgent
  );

  res.status(200).json({
    status: 'success',
    message: 'Configurations updated successfully',
    data: { settings: updatedSettings },
  });
});

export const getPublicSettings = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const settings = await systemSettingsService.getPublicSettings();

  const formatted: Record<string, string> = {};
  for (const s of settings) {
    formatted[s.key] = s.value;
  }

  res.status(200).json({
    status: 'success',
    data: { settings: formatted },
  });
});
