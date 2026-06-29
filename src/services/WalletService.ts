import prisma from '../database/db';
import walletRepository from '../repositories/WalletRepository';
import transactionRepository from '../repositories/TransactionRepository';
import withdrawalRepository from '../repositories/WithdrawalRepository';
import depositRepository from '../repositories/DepositRepository';
import AppError from '../utils/AppError';
import notificationService from '../notifications/NotificationService';
import { Prisma } from '@prisma/client';
import { systemSettingsCache } from '../modules/system-settings/SystemSettingsCache';
import referralService from './ReferralService';


export class WalletService {
  async getBalance(userId: string) {
    const wallet = await walletRepository.findByUserId(userId);
    if (!wallet) {
      throw new AppError('Wallet not found', 404);
    }
    return {
      depositBalance: wallet.depositBalance,
      winningBalance: wallet.winningBalance,
      bonusBalance: wallet.bonusBalance,
      totalBalance: wallet.depositBalance + wallet.winningBalance + wallet.bonusBalance,
    };
  }

  async getTransactionHistory(userId: string) {
    return transactionRepository.find({ userId });
  }

  async getDepositHistory(userId: string) {
    return depositRepository.find({ userId });
  }

  async getWithdrawalHistory(userId: string) {
    return withdrawalRepository.find({ userId });
  }

  async getWalletLedger(userId: string) {
    return prisma.walletLedger.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
    });
  }

  async createDepositRequest(userId: string, data: any): Promise<any> {
    const manualDepositEnabled = systemSettingsCache.getBoolean('MANUAL_DEPOSIT_ENABLED', true);
    if (!manualDepositEnabled) {
      throw new AppError('Manual deposits are currently disabled by administrator.', 403);
    }

    const { amount, transactionId, paymentMethod, screenshotUrl } = data;

    // Fetch MIN_DEPOSIT and MAX_DEPOSIT settings
    const minDeposit = systemSettingsCache.getNumber('MIN_DEPOSIT', 100);
    const maxDeposit = systemSettingsCache.getNumber('MAX_DEPOSIT', 100000);
    if (amount < minDeposit) {
      throw new AppError(`Minimum deposit amount is ₹${minDeposit}`, 400);
    }
    if (amount > maxDeposit) {
      throw new AppError(`Maximum deposit amount is ₹${maxDeposit}`, 400);
    }

    const existing = await depositRepository.findOne({ transactionId });
    if (existing) {
      throw new AppError('Transaction ID already submitted', 400);
    }


    const request = await depositRepository.create({
      userId,
      amount,
      transactionId,
      paymentMethod,
      screenshotUrl,
      status: 'PENDING',
    });

    await notificationService.sendNotification(
      userId,
      'Deposit Request Submitted',
      `Your request to deposit ₹${amount} has been received and is pending approval.`,
      'WALLET'
    );

    return request;
  }

  // Transactional Withdrawal requests
  async createWithdrawalRequest(userId: string, data: any): Promise<any> {
    const { amount, paymentMethod, paymentDetails } = data;

    // Enforce payment method toggles
    if (paymentMethod === 'UPI' && !systemSettingsCache.getBoolean('UPI_ENABLED', true)) {
      throw new AppError('UPI withdrawals are currently disabled by administrator.', 403);
    }
    if (paymentMethod === 'BANK' && !systemSettingsCache.getBoolean('MANUAL_WITHDRAWAL_ENABLED', true)) {
      throw new AppError('Bank IMPS/NEFT withdrawals are currently disabled by administrator.', 403);
    }

    // Fetch MIN_WITHDRAWAL, MAX_WITHDRAWAL, and MAX_DAILY_WITHDRAWALS settings
    const minWithdrawal = systemSettingsCache.getNumber('MIN_WITHDRAWAL', 100);
    const maxWithdrawal = systemSettingsCache.getNumber('MAX_WITHDRAWAL', 10000);
    if (amount < minWithdrawal) {
      throw new AppError(`Minimum withdrawal amount is ₹${minWithdrawal}`, 400);
    }
    if (amount > maxWithdrawal) {
      throw new AppError(`Maximum withdrawal amount is ₹${maxWithdrawal}`, 400);
    }

    const maxDailyWithdrawals = systemSettingsCache.getNumber('MAX_DAILY_WITHDRAWALS', 3);

    // Count withdrawal requests created today
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const dailyCount = await prisma.withdrawalRequest.count({
      where: {
        userId,
        createdAt: { gte: startOfToday },
        status: { in: ['PENDING', 'APPROVED'] }
      }
    });

    if (dailyCount >= maxDailyWithdrawals) {
      throw new AppError(`Maximum daily withdrawal limit of ${maxDailyWithdrawals} requests reached`, 400);
    }

    return prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet || wallet.winningBalance < amount) {
        throw new AppError('Insufficient winning balance for withdrawal', 400);
      }


      // Deduct winning balance immediately to lock funds
      await walletRepository.updateBalanceWithLedger(
        userId,
        -amount,
        'WINNING',
        `Locked for withdrawal request`,
        undefined,
        tx
      );

      // Calculate platform charges
      const chargesPercent = systemSettingsCache.getNumber('WITHDRAWAL_CHARGES_PERCENT', 0);
      const fee = (amount * chargesPercent) / 100;
      const isAutoWithdraw = systemSettingsCache.getBoolean('AUTO_WITHDRAWAL_ENABLED', false);

      const request = await tx.withdrawalRequest.create({
        data: {
          userId,
          amount,
          paymentMethod,
          paymentDetails,
          status: isAutoWithdraw ? 'APPROVED' : 'PENDING',
          processedAt: isAutoWithdraw ? new Date() : null,
        },
      });

      // Create transaction log
      await tx.transaction.create({
        data: {
          userId,
          walletId: wallet.id,
          amount,
          type: 'WITHDRAW',
          status: isAutoWithdraw ? 'SUCCESS' : 'PENDING',
          referenceId: request.id,
          description: `Withdrawal request via ${paymentMethod} (${chargesPercent}% fee: ₹${fee.toFixed(2)})${isAutoWithdraw ? ' [Auto-Processed]' : ''}`,
        },
      });

      await notificationService.sendNotification(
        userId,
        'Withdrawal Request Submitted',
        `Your withdrawal request for ₹${amount} has been registered.`,
        'WALLET'
      );

      return request;
    });
  }

  // Transactional Withdrawal cancels
  async cancelWithdrawalRequest(userId: string, requestId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const request = await tx.withdrawalRequest.findUnique({ where: { id: requestId } });
      if (!request || request.userId !== userId) {
        throw new AppError('Withdrawal request not found', 404);
      }

      if (request.status !== 'PENDING') {
        throw new AppError('Can only cancel pending requests', 400);
      }

      // Mark request as cancelled
      await tx.withdrawalRequest.update({
        where: { id: requestId },
        data: { status: 'CANCELLED' },
      });

      // Find transaction and mark as failed
      const matchTx = await tx.transaction.findFirst({
        where: { referenceId: request.id },
      });

      if (matchTx) {
        await tx.transaction.update({
          where: { id: matchTx.id },
          data: { status: 'FAILED', description: 'Cancelled by user' },
        });
      }

      // Return funds to winning balance
      await walletRepository.updateBalanceWithLedger(
        userId,
        request.amount,
        'WINNING',
        'Refund from cancelled withdrawal request',
        undefined,
        tx
      );

      await notificationService.sendNotification(
        userId,
        'Withdrawal Cancelled',
        `Your withdrawal request for ₹${request.amount} has been cancelled and refunded.`,
        'WALLET'
      );
    });
  }

  async createPendingGatewayTransaction(
    userId: string,
    amount: number,
    gatewayName: string,
    orderId: string
  ): Promise<any> {
    const wallet = await walletRepository.findByUserId(userId);
    if (!wallet) throw new AppError('Wallet not found', 404);

    return prisma.transaction.create({
      data: {
        userId,
        walletId: wallet.id,
        amount,
        type: 'DEPOSIT',
        status: 'PENDING',
        referenceId: orderId,
        description: `Initiated Deposit via ${gatewayName}`,
        razorpayOrderId: orderId,
      },
    });
  }

  async creditWalletFromGateway(
    userId: string,
    amount: number,
    gatewayName: string,
    transactionDetails: {
      orderId: string;
      paymentId: string;
      signature?: string;
      gatewayResponse: string;
      paymentMethod?: string;
    }
  ): Promise<any> {
    const result = await prisma.$transaction(async (tx) => {

      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) throw new AppError('Wallet not found', 404);

      // Check if this paymentId has already been processed to avoid duplicate crediting
      const duplicateTx = await tx.transaction.findFirst({
        where: {
          razorpayPaymentId: transactionDetails.paymentId,
          status: 'SUCCESS'
        }
      });
      if (duplicateTx) {
        throw new AppError('Payment already processed', 400);
      }

      // Check if there was a pending transaction for this order
      const pendingTx = await tx.transaction.findFirst({
        where: {
          razorpayOrderId: transactionDetails.orderId,
          status: 'PENDING'
        }
      });

      // Update wallet balance with ledger
      const updatedWallet = await walletRepository.updateBalanceWithLedger(
        userId,
        amount,
        'DEPOSIT',
        `Deposit via ${gatewayName}. Payment ID: ${transactionDetails.paymentId}`,
        undefined,
        tx
      );

      // If pending transaction exists, update it to SUCCESS; otherwise create a new transaction
      let transaction;
      if (pendingTx) {
        transaction = await tx.transaction.update({
          where: { id: pendingTx.id },
          data: {
            status: 'SUCCESS',
            razorpayPaymentId: transactionDetails.paymentId,
            razorpaySignature: transactionDetails.signature,
            gatewayResponse: transactionDetails.gatewayResponse,
            paymentMethod: transactionDetails.paymentMethod || 'gateway',
            description: `Online Deposit via ${gatewayName} (Success)`,
          }
        });
      } else {
        transaction = await tx.transaction.create({
          data: {
            userId,
            walletId: wallet.id,
            amount,
            type: 'DEPOSIT',
            status: 'SUCCESS',
            referenceId: transactionDetails.orderId,
            description: `Online Deposit via ${gatewayName}`,
            razorpayOrderId: transactionDetails.orderId,
            razorpayPaymentId: transactionDetails.paymentId,
            razorpaySignature: transactionDetails.signature,
            gatewayResponse: transactionDetails.gatewayResponse,
            paymentMethod: transactionDetails.paymentMethod || 'gateway',
          },
        });
      }

      await notificationService.sendNotification(
        userId,
        'Wallet Credited',
        `Your deposit of ₹${amount} via ${gatewayName} was successful and credited to your wallet.`,
        'WALLET'
      );

      return { wallet: updatedWallet, transaction };
    });

    // Trigger first-deposit referral reward checks asynchronously (failsafe)
    try {
      await referralService.processReferralReward(userId);
    } catch (err) {
      // Fail silently to prevent crashing payment gateway response
    }

    return result;
  }

}

export const walletService = new WalletService();
export default walletService;
