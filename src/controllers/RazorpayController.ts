import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../interfaces/auth.interface';
import razorpayService from '../services/RazorpayService';
import walletService from '../services/WalletService';
import { env } from '../config/env';
import { logger } from '../config/logger';
import AppError from '../utils/AppError';
import catchAsync from '../utils/catchAsync';
import prisma from '../database/db';
import { systemSettingsCache } from '../modules/system-settings/SystemSettingsCache';

export const createOrder = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const razorpayEnabled = systemSettingsCache.getBoolean('RAZORPAY_ENABLED', true);
  if (!razorpayEnabled) {
    return next(new AppError('Razorpay deposits are temporarily disabled.', 403));
  }

  const userId = req.user!.id;
  const { amount } = req.body;

  if (!amount || isNaN(amount) || amount <= 0) {
    return next(new AppError('Invalid amount specified', 400));
  }

  // Fetch MIN_DEPOSIT and MAX_DEPOSIT settings
  const minDeposit = systemSettingsCache.getNumber('MIN_DEPOSIT', 100);
  const maxDeposit = systemSettingsCache.getNumber('MAX_DEPOSIT', 100000);
  if (amount < minDeposit) {
    return next(new AppError(`Minimum deposit amount is ₹${minDeposit}`, 400));
  }
  if (amount > maxDeposit) {
    return next(new AppError(`Maximum deposit amount is ₹${maxDeposit}`, 400));
  }


  // Generate a receipt ID
  const receiptId = `rcpt_${Date.now()}`;

  // Create Razorpay Order
  const order = await razorpayService.createOrder(amount, receiptId);

  // Log initiated transaction in database as PENDING
  await walletService.createPendingGatewayTransaction(
    userId,
    amount,
    'Razorpay',
    order.id
  );

  res.status(200).json({
    status: 'success',
    data: {
      keyId: env.RAZORPAY_KEY_ID,
      amount: order.amount,
      currency: order.currency,
      orderId: order.id,
    },
  });
});

export const verifyPayment = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const userId = req.user!.id;
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !amount) {
    return next(new AppError('Missing payment verification details', 400));
  }

  // 1. Signature verification
  const isValid = razorpayService.verifySignature(
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature
  );

  if (!isValid) {
    // Update pending transaction to FAILED
    const pendingTx = await prisma.transaction.findFirst({
      where: { razorpayOrderId: razorpay_order_id, status: 'PENDING' },
    });
    if (pendingTx) {
      await prisma.transaction.update({
        where: { id: pendingTx.id },
        data: {
          status: 'FAILED',
          razorpayPaymentId: razorpay_payment_id,
          razorpaySignature: razorpay_signature,
          description: 'Payment verification failed: invalid signature',
        },
      });
    }

    return next(new AppError('Payment signature verification failed. Invalid transaction.', 400));
  }

  // 2. Process wallet credit and change status to SUCCESS (uses a database transaction)
  try {
    const result = await walletService.creditWalletFromGateway(
      userId,
      parseFloat(amount),
      'Razorpay',
      {
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        signature: razorpay_signature,
        gatewayResponse: JSON.stringify({
          status: 'SUCCESS',
          verifiedAt: new Date().toISOString(),
          payment_id: razorpay_payment_id,
        }),
        paymentMethod: 'Razorpay-Online',
      }
    );

    res.status(200).json({
      status: 'success',
      message: 'Payment verified and wallet credited successfully',
      data: result,
    });
  } catch (error: any) {
    logger.error('Error processing gateway credit:', error);
    return next(new AppError(error.message || 'Payment verification failed during processing', 400));
  }
});
