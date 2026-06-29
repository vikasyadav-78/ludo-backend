import { Request, Response, NextFunction } from 'express';
import authService from '../services/AuthService';
import catchAsync from '../utils/catchAsync';
import { AuthenticatedRequest } from '../interfaces/auth.interface';

export const registerSendOtp = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const result = await authService.registerSendOtp(req.body);
  res.status(200).json(result);
});

export const registerVerifyOtp = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const result = await authService.registerVerifyOtp(req.body);
  res.status(201).json({
    status: 'success',
    data: result,
  });
});

export const login = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const ipAddress = req.ip || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';
  const result = await authService.login(req.body, ipAddress, userAgent);

  res.status(200).json({
    status: 'success',
    data: result,
  });
});

export const refreshToken = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const { refreshToken } = req.body;
  const result = await authService.refreshToken(refreshToken);
  res.status(200).json({
    status: 'success',
    data: result,
  });
});

export const changePassword = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const userId = req.user!.id;
  await authService.changePassword(userId, req.body);
  res.status(200).json({
    status: 'success',
    message: 'Password changed successfully',
  });
});

export const forgotPassword = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const { identifier: reqIdentifier, email } = req.body;
  const identifier = reqIdentifier || email;

  const result = await authService.sendForgotPasswordOtp(identifier);
  const isEmail = identifier.includes('@');

  res.status(200).json({
    status: 'success',
    method: isEmail ? 'EMAIL' : 'MOBILE',
    message: result.message,
    ...(process.env.NODE_ENV === 'development' ? { otp: result.otp } : {}),
  });
});

export const resetPassword = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const { token, password } = req.body;
  await authService.resetPassword(token, password);
  res.status(200).json({
    status: 'success',
    message: 'Password reset successful',
  });
});

export const resetPasswordMobile = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  await authService.resetPasswordMobile(req.body);
  res.status(200).json({
    status: 'success',
    message: 'Password reset successful',
  });
});

export const logout = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  res.status(200).json({
    status: 'success',
    message: 'Logged out successfully',
  });
});
