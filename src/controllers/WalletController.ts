import { Response, NextFunction } from 'express';
import walletService from '../services/WalletService';
import { uploadBufferToCloudinary } from '../utils/cloudinary';
import { AuthenticatedRequest } from '../interfaces/auth.interface';
import AppError from '../utils/AppError';
import catchAsync from '../utils/catchAsync';

export const getBalance = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const userId = req.user!.id;
  const balance = await walletService.getBalance(userId);
  res.status(200).json({
    status: 'success',
    data: balance,
  });
});

export const getTransactionHistory = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const userId = req.user!.id;
  const transactions = await walletService.getTransactionHistory(userId);
  res.status(200).json({
    status: 'success',
    data: { transactions },
  });
});

export const getDepositHistory = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const userId = req.user!.id;
  const deposits = await walletService.getDepositHistory(userId);
  res.status(200).json({
    status: 'success',
    data: { deposits },
  });
});

export const getWithdrawalHistory = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const userId = req.user!.id;
  const withdrawals = await walletService.getWithdrawalHistory(userId);
  res.status(200).json({
    status: 'success',
    data: { withdrawals },
  });
});

export const getWalletLedger = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const userId = req.user!.id;
  const ledger = await walletService.getWalletLedger(userId);
  res.status(200).json({
    status: 'success',
    data: { ledger },
  });
});

export const createDepositRequest = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const userId = req.user!.id;
  let screenshotUrl = '';

  if (req.file) {
    const cloudResult = await uploadBufferToCloudinary(req.file.buffer, 'deposits');
    screenshotUrl = cloudResult.secure_url;
  }

  const depositData = {
    amount: parseFloat(req.body.amount),
    transactionId: req.body.transactionId,
    paymentMethod: req.body.paymentMethod,
    screenshotUrl,
  };

  const deposit = await walletService.createDepositRequest(userId, depositData);

  res.status(201).json({
    status: 'success',
    data: { deposit },
  });
});

export const createWithdrawalRequest = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const userId = req.user!.id;
  const request = await walletService.createWithdrawalRequest(userId, req.body);
  res.status(201).json({
    status: 'success',
    data: { request },
  });
});

export const cancelWithdrawalRequest = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const userId = req.user!.id;
  const { id } = req.params;
  await walletService.cancelWithdrawalRequest(userId, id);
  res.status(200).json({
    status: 'success',
    message: 'Withdrawal request cancelled and refunded successfully',
  });
});
