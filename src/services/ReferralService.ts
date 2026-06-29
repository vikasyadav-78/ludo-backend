import prisma from '../database/db';
import walletRepository from '../repositories/WalletRepository';
import AppError from '../utils/AppError';
import notificationService from '../notifications/NotificationService';
import { Prisma } from '@prisma/client';

export class ReferralService {
  async getReferralCode(userId: string, mobile: string): Promise<string> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    return user?.referralCode || mobile;
  }

  async getMyReferrals(userId: string) {
    return prisma.referral.findMany({
      where: { referrerId: userId },
      include: { referred: { select: { name: true, email: true, status: true } } },
    });
  }

  async getMyRewards(userId: string) {
    return prisma.referralReward.findMany({
      where: { referrerId: userId },
      include: { referred: { select: { name: true, email: true } } },
    });
  }

  async getReferralDashboardStats(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true }
    });
    const referralCode = user?.referralCode || '';

    const totalReferrals = await prisma.referral.count({
      where: { referrerId: userId }
    });

    const activeReferrals = await prisma.referral.count({
      where: {
        referrerId: userId,
        referred: { status: 'ACTIVE' }
      }
    });

    const rewardsSum = await prisma.referralReward.aggregate({
      where: {
        referrerId: userId,
        status: 'CLAIMED'
      },
      _sum: { amount: true }
    });
    const firstDepositRewards = rewardsSum._sum.amount || 0;

    const commissionSum = await prisma.transaction.aggregate({
      where: {
        userId: userId,
        type: 'REFERRAL_BONUS',
        description: { contains: 'commission' },
        status: 'SUCCESS'
      },
      _sum: { amount: true }
    });
    const commissionEarnings = commissionSum._sum.amount || 0;

    const totalEarnings = firstDepositRewards + commissionEarnings;

    return {
      referralCode,
      totalReferrals,
      activeReferrals,
      firstDepositRewards,
      commissionEarnings,
      totalEarnings
    };
  }


  // Transactional referral reward processor
  async processReferralReward(referredId: string): Promise<void> {
    // 1. Check if referral system is enabled
    const refSystemSetting = await prisma.adminSetting.findUnique({
      where: { key: 'REFERRAL_SYSTEM_ENABLED' }
    });
    const referralSystemEnabled = refSystemSetting ? refSystemSetting.value === 'true' : true;
    if (!referralSystemEnabled) return;

    const referral = await prisma.referral.findUnique({
      where: { referredId },
    });
    if (!referral) return; // Not referred by anyone

    const reward = await prisma.referralReward.findFirst({
      where: {
        referrerId: referral.referrerId,
        referredId: referredId,
        status: 'PENDING',
      },
    });

    if (!reward) return; // Reward already processed or doesn't exist

    await prisma.$transaction(async (tx) => {
      // Mark reward claimed to prevent race conditions or duplicate rewards
      await tx.referralReward.update({
        where: { id: reward.id },
        data: { status: 'CLAIMED' },
      });

      const wallet = await tx.wallet.findUnique({ where: { userId: referral.referrerId } });
      if (wallet) {
        // Credit first deposit bonus reward to referrer
        await walletRepository.updateBalanceWithLedger(
          referral.referrerId,
          reward.amount,
          'BONUS',
          `Referral first deposit reward for inviting: ${referredId}`,
          undefined,
          tx
        );

        // Transaction log
        await tx.transaction.create({
          data: {
            userId: referral.referrerId,
            walletId: wallet.id,
            amount: reward.amount,
            type: 'REFERRAL_BONUS',
            status: 'SUCCESS',
            description: `Referral bonus reward for inviting new user`,
          },
        });
      }

      await notificationService.sendNotification(
        referral.referrerId,
        'Referral Bonus Earned',
        `You have earned ₹${reward.amount} bonus balance for your referral!`,
        'WALLET'
      );
    });
  }

  // Calculate and process referral winning commission (goes to Winning Balance)
  async processWinningCommission(
    referredId: string,
    winningAmount: number,
    battleId: string,
    tx: Prisma.TransactionClient
  ): Promise<void> {
    // 1. Check if referral system is enabled
    const refSystemSetting = await tx.adminSetting.findUnique({
      where: { key: 'REFERRAL_SYSTEM_ENABLED' }
    });
    const referralSystemEnabled = refSystemSetting ? refSystemSetting.value === 'true' : true;
    if (!referralSystemEnabled) return;

    // 2. Find referral relation
    const referral = await tx.referral.findUnique({
      where: { referredId },
    });
    if (!referral) return; // Not referred by anyone

    // Safety check: same user cannot refer themselves
    if (referral.referrerId === referredId) return;

    // 3. Load commission percentage setting (default 0.5)
    const commissionSetting = await tx.adminSetting.findUnique({
      where: { key: 'REFERRAL_WINNING_COMMISSION_PERCENT' }
    });
    const commissionPct = commissionSetting ? parseFloat(commissionSetting.value) : 0.5;
    if (commissionPct <= 0) return;

    // 4. Calculate commission amount
    const commissionAmount = (winningAmount * commissionPct) / 100;
    if (commissionAmount <= 0) return;

    // 5. Credit referrer's WINNING balance (not BONUS)
    const referrerWallet = await tx.wallet.findUnique({
      where: { userId: referral.referrerId }
    });
    if (!referrerWallet) return;

    await walletRepository.updateBalanceWithLedger(
      referral.referrerId,
      commissionAmount,
      'WINNING',
      `Referral winning commission from User ID ${referredId} in Battle ID ${battleId}`,
      undefined,
      tx
    );

    // 6. Record transaction log
    await tx.transaction.create({
      data: {
        userId: referral.referrerId,
        walletId: referrerWallet.id,
        amount: commissionAmount,
        type: 'REFERRAL_BONUS',
        status: 'SUCCESS',
        referenceId: battleId,
        description: `Referral commission from battle won by invitee`,
      },
    });

    // 7. Send notification
    await notificationService.sendNotification(
      referral.referrerId,
      'Referral Commission Earned',
      `You earned ₹${commissionAmount.toFixed(2)} referral commission from a battle win!`,
      'WALLET'
    );
  }
}

export const referralService = new ReferralService();
export default referralService;

