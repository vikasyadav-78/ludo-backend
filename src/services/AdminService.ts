import prisma from '../database/db';
import userRepository from '../repositories/UserRepository';
import walletRepository from '../repositories/WalletRepository';
import transactionRepository from '../repositories/TransactionRepository';
import referralService from './ReferralService';
import notificationService from '../notifications/NotificationService';
import AppError from '../utils/AppError';
import { emitBattleUpdate, getOnlineUsersCount, emitAdminEvent, emitSettingsUpdate } from '../socket/socket';
import { deleteCloudinaryImage } from '../utils/cloudinary';
import { BalanceType, RequestStatus, BannerStatus, AnnouncementStatus, AdminDecision, BattleStatus } from '@prisma/client';
import { settingsCache } from './SettingsCache';

export class AdminService {
  async getDashboardStats() {
    const totalUsers = await prisma.user.count({ where: { role: 'USER' } });
    const totalBattles = await prisma.battle.count();
    const pendingDeposits = await prisma.depositRequest.count({ where: { status: 'PENDING' } });
    const pendingWithdrawals = await prisma.withdrawalRequest.count({ where: { status: 'PENDING' } });

    const totalRevenueResult = await prisma.platformRevenue.aggregate({
      _sum: {
        commissionEarned: true,
        totalBattleVolume: true,
      },
    });

    const totalRevenue = totalRevenueResult._sum.commissionEarned || 0;
    const totalVolume = totalRevenueResult._sum.totalBattleVolume || 0;

    // Active Users Today (unique users with logins since midnight)
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const activeUsersToday = await prisma.user.count({
      where: {
        lastLoginAt: { gte: startOfToday },
        role: 'USER'
      }
    });

    // Active Users This Week (unique users with logins in last 7 days)
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - 7);
    const activeUsersThisWeek = await prisma.user.count({
      where: {
        lastLoginAt: { gte: startOfWeek },
        role: 'USER'
      }
    });

    // Online users count (active sockets)
    const onlineUsers = getOnlineUsersCount();

    // Group battles by status
    const battleGroups = await prisma.battle.groupBy({
      by: ['status'],
      _count: { id: true }
    });

    const statusCounts = {
      OPEN: 0,
      JOINED: 0,
      IN_PROGRESS: 0,
      RESULT_SUBMITTED: 0,
      PENDING_APPROVAL: 0,
      COMPLETED: 0,
      SETTLED: 0,
      DISPUTED: 0,
      CANCELLED: 0
    };

    battleGroups.forEach(g => {
      if (g.status in statusCounts) {
        statusCounts[g.status] = g._count.id;
      }
    });

    return {
      totalUsers,
      totalBattles,
      pendingDeposits,
      pendingWithdrawals,
      totalRevenue,
      totalVolume,
      activeUsersToday,
      activeUsersThisWeek,
      onlineUsers,
      statusCounts
    };
  }

  async getUsers() {
    return prisma.user.findMany({
      where: { role: 'USER' },
      select: { id: true, name: true, email: true, mobile: true, role: true, status: true, avatar: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateUserStatus(userId: string, status: 'ACTIVE' | 'SUSPENDED'): Promise<void> {
    await userRepository.update(userId, { status });
  }

  // Transactional Wallet balance manual corrections
  async updateWalletBalance(adminId: string, userId: string, data: any): Promise<void> {
    const { amount, balanceType, type } = data;
    const description = `Admin Manual adjustment (${type === 'credit' ? 'CREDIT' : 'DEBIT'})`;

    await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) throw new AppError('Wallet not found', 404);

      await walletRepository.updateBalanceWithLedger(
        userId,
        amount,
        balanceType as BalanceType,
        description,
        undefined,
        tx
      );

      // Create transaction log
      await tx.transaction.create({
        data: {
          userId,
          walletId: wallet.id,
          amount: Math.abs(amount),
          type: type === 'credit' ? 'ADMIN_CREDIT' : 'ADMIN_DEBIT',
          status: 'SUCCESS',
          description: `Adjusted by admin ID: ${adminId}. Reason: ${description}`,
        },
      });

      await notificationService.sendNotification(
        userId,
        'Wallet Adjusted',
        `An admin has manually adjusted your ${balanceType} balance by ₹${amount}.`,
        'WALLET'
      );
    });
  }

  async getDepositRequests() {
    return prisma.depositRequest.findMany({
      include: { user: { select: { name: true, email: true, mobile: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Transactional Deposit approvals
  async approveDepositRequest(adminId: string, requestId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const request = await tx.depositRequest.findUnique({ where: { id: requestId } });
      if (!request) throw new AppError('Deposit request not found', 404);

      if (request.status !== 'PENDING') {
        throw new AppError('Request already processed', 400);
      }

      // Approve Request
      await tx.depositRequest.update({
        where: { id: requestId },
        data: {
          status: 'APPROVED',
          processedBy: adminId,
          processedAt: new Date(),
        },
      });

      const wallet = await tx.wallet.findUnique({ where: { userId: request.userId } });
      if (!wallet) throw new AppError('Wallet not found', 404);

      // Credit deposit balance
      await walletRepository.updateBalanceWithLedger(
        request.userId,
        request.amount,
        'DEPOSIT',
        `Manual Deposit Approved. Transaction: ${request.transactionId}`,
        undefined,
        tx
      );

      // Create transaction log
      await tx.transaction.create({
        data: {
          userId: request.userId,
          walletId: wallet.id,
          amount: request.amount,
          type: 'DEPOSIT',
          status: 'SUCCESS',
          referenceId: request.id,
          description: `Deposit via ${request.paymentMethod}`,
        },
      });

      await notificationService.sendNotification(
        request.userId,
        'Deposit Approved',
        `Your deposit of ₹${request.amount} has been approved and credited.`,
        'WALLET'
      );
    });

    // Trigger referral rewards (non-blocking outside transaction frame if preferred, or within)
    const request = await prisma.depositRequest.findUnique({ where: { id: requestId } });
    if (request) {
      await referralService.processReferralReward(request.userId);
    }
  }

  async rejectDepositRequest(adminId: string, requestId: string, reason: string): Promise<void> {
    await prisma.depositRequest.update({
      where: { id: requestId },
      data: {
        status: 'REJECTED',
        rejectedReason: reason,
        processedBy: adminId,
        processedAt: new Date(),
      },
    });

    const request = await prisma.depositRequest.findUnique({ where: { id: requestId } });
    if (request) {
      await notificationService.sendNotification(
        request.userId,
        'Deposit Rejected',
        `Your deposit request for ₹${request.amount} was rejected. Reason: ${reason}`,
        'WALLET'
      );
    }
  }

  async getWithdrawalRequests() {
    return prisma.withdrawalRequest.findMany({
      include: { user: { select: { name: true, email: true, mobile: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Transactional withdrawal approvals
  async approveWithdrawalRequest(adminId: string, requestId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const request = await tx.withdrawalRequest.findUnique({ where: { id: requestId } });
      if (!request) throw new AppError('Withdrawal request not found', 404);

      if (request.status !== 'PENDING') {
        throw new AppError('Request already processed', 400);
      }

      await tx.withdrawalRequest.update({
        where: { id: requestId },
        data: {
          status: 'APPROVED',
          processedBy: adminId,
          processedAt: new Date(),
        },
      });

      // Update matching transaction status to SUCCESS
      const matchTx = await tx.transaction.findFirst({
        where: { referenceId: request.id },
      });

      if (matchTx) {
        await tx.transaction.update({
          where: { id: matchTx.id },
          data: { status: 'SUCCESS' },
        });
      }

      await notificationService.sendNotification(
        request.userId,
        'Withdrawal Approved',
        `Your withdrawal request for ₹${request.amount} has been approved.`,
        'WALLET'
      );
    });
  }

  // Transactional withdrawal rejects
  async rejectWithdrawalRequest(adminId: string, requestId: string, reason: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const request = await tx.withdrawalRequest.findUnique({ where: { id: requestId } });
      if (!request) throw new AppError('Withdrawal request not found', 404);

      if (request.status !== 'PENDING') {
        throw new AppError('Request already processed', 400);
      }

      await tx.withdrawalRequest.update({
        where: { id: requestId },
        data: {
          status: 'REJECTED',
          rejectedReason: reason,
          processedBy: adminId,
          processedAt: new Date(),
        },
      });

      // Update matching transaction status to FAILED
      const matchTx = await tx.transaction.findFirst({
        where: { referenceId: request.id },
      });

      if (matchTx) {
        await tx.transaction.update({
          where: { id: matchTx.id },
          data: { status: 'FAILED', description: `Rejected by admin. Reason: ${reason}` },
        });
      }

      // Refund the winning balance
      await walletRepository.updateBalanceWithLedger(
        request.userId,
        request.amount,
        'WINNING',
        `Refund for rejected withdrawal request`,
        undefined,
        tx
      );

      await notificationService.sendNotification(
        request.userId,
        'Withdrawal Rejected',
        `Your withdrawal request for ₹${request.amount} was rejected and refunded. Reason: ${reason}`,
        'WALLET'
      );
    });
  }

  // Transactional dispute settling / pending approval resolving
  async resolveBattleDispute(adminId: string, battleId: string, decision: 'CREATOR_WIN' | 'JOINER_WIN' | 'CANCEL'): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const battle = await tx.battle.findUnique({ where: { id: battleId } });
      if (!battle) throw new AppError('Battle not found', 404);

      if (battle.status !== 'DISPUTED' && battle.status !== 'PENDING_APPROVAL') {
        throw new AppError('Battle is not disputed or pending approval', 400);
      }

      if (decision === 'CANCEL') {
        // Cancel battle and refund both
        const updated = await tx.battle.update({
          where: { id: battleId },
          data: { status: 'CANCELLED' },
        });

        // Refund creator
        await walletRepository.updateBalanceWithLedger(
          battle.createdBy,
          battle.amount,
          'DEPOSIT',
          `Disputed/Pending Battle Cancelled by Admin: ${battle.title}`,
          undefined,
          tx
        );

        // Refund joiner
        if (battle.joinedBy) {
          await walletRepository.updateBalanceWithLedger(
            battle.joinedBy,
            battle.amount,
            'DEPOSIT',
            `Disputed/Pending Battle Cancelled by Admin: ${battle.title}`,
            undefined,
            tx
          );
        }

        // Notify
        await notificationService.sendNotification(
          battle.createdBy,
          'Disputed/Pending Battle Cancelled',
          `Disputed or pending battle "${battle.title}" has been cancelled by an admin and refunded.`,
          'BATTLE',
          battle.id
        );
        if (battle.joinedBy) {
          await notificationService.sendNotification(
            battle.joinedBy,
            'Disputed/Pending Battle Cancelled',
            `Disputed or pending battle "${battle.title}" has been cancelled by an admin and refunded.`,
            'BATTLE',
            battle.id
          );
        }

        emitBattleUpdate(battle.id, 'battle_completed', updated);
      } else {
        const winnerId = decision === 'CREATOR_WIN' ? battle.createdBy : battle.joinedBy;
        const loserId = decision === 'CREATOR_WIN' ? battle.joinedBy : battle.createdBy;

        if (!winnerId || !loserId) throw new AppError('Winner or Loser not identified', 400);

        const updated = await tx.battle.update({
          where: { id: battleId },
          data: {
            status: 'COMPLETED',
            winnerId: winnerId,
          },
        });

        // Credit winner
        const wallet = await tx.wallet.findUnique({ where: { userId: winnerId } });
        if (wallet) {
          await walletRepository.updateBalanceWithLedger(
            winnerId,
            battle.winnerAmount,
            'WINNING',
            `Disputed/Pending Battle Won: ${battle.title} (Admin resolved)`,
            undefined,
            tx
          );

          // Process referrer commission reward (0.5% winning commission)
          await referralService.processWinningCommission(winnerId, battle.winnerAmount, battle.id, tx);


          // Win transaction
          await tx.transaction.create({
            data: {
              userId: winnerId,
              walletId: wallet.id,
              amount: battle.winnerAmount,
              type: 'BATTLE_WIN',
              status: 'SUCCESS',
              referenceId: battle.id,
              description: `Won disputed/pending battle: "${battle.title}" (Admin decision)`,
            },
          });

          // Platform revenue
          const totalVolume = battle.amount * 2;
          const commissionEarned = totalVolume - battle.winnerAmount;
          await tx.platformRevenue.create({
            data: {
              battleId: battle.id,
              commissionEarned,
              totalBattleVolume: totalVolume,
            },
          });
        }

        await notificationService.sendNotification(
          winnerId,
          'Disputed/Pending Battle Victory',
          `Admin completed review. You were declared the winner of "${battle.title}" and earned ₹${battle.winnerAmount}.`,
          'BATTLE',
          battle.id
        );

        await notificationService.sendNotification(
          loserId,
          'Disputed/Pending Battle Completed',
          `Admin completed review. Opponent was declared the winner of "${battle.title}".`,
          'BATTLE',
          battle.id
        );

        emitBattleUpdate(battle.id, 'battle_completed', updated);
      }
    });
  }

  // Banners & Announcements
  async createBanner(imageUrl: string, title: string, link?: string) {
    return prisma.banner.create({ data: { imageUrl, title, link } });
  }

  async deleteBanner(bannerId: string) {
    return prisma.banner.delete({ where: { id: bannerId } });
  }

  async createAnnouncement(adminId: string, message: string) {
    return prisma.announcement.create({ data: { message, createdBy: adminId, status: 'ACTIVE' } });
  }

  async deleteAnnouncement(announcementId: string) {
    return prisma.announcement.delete({ where: { id: announcementId } });
  }

  // Admin Settings Management
  async getSettings() {
    return settingsCache.getAll();
  }


  async updateSettings(settings: Record<string, string>) {
    const keys = Object.keys(settings);
    for (const key of keys) {
      const val = String(settings[key]);
      await prisma.adminSetting.upsert({
        where: { key },
        update: { value: val },
        create: {
          key,
          value: val,
          description: `Global config for ${key}`,
        }
      });
      // Update cache locally
      settingsCache.setLocal(key, val);
    }

    // Broadcast the updated settings to all players
    const allSettings = settingsCache.getAll();
    emitSettingsUpdate(allSettings);

    return allSettings;
  }

  async getReferralAnalytics() {
    const totalReferrals = await prisma.referral.count();
    
    const claimedRewardsAgg = await prisma.referralReward.aggregate({
      where: { status: 'CLAIMED' },
      _sum: { amount: true }
    });
    const totalFirstDepositRewards = claimedRewardsAgg._sum.amount || 0;

    const commissionAgg = await prisma.transaction.aggregate({
      where: {
        type: 'REFERRAL_BONUS',
        description: { contains: 'commission' },
        status: 'SUCCESS'
      },
      _sum: { amount: true }
    });
    const totalCommissionEarnings = commissionAgg._sum.amount || 0;

    return {
      totalReferrals,
      totalFirstDepositRewards,
      totalCommissionEarnings,
      totalReferralPayouts: totalFirstDepositRewards + totalCommissionEarnings,
    };
  }

  async getTopReferrers() {
    const topReferrersRaw = await prisma.referral.groupBy({
      by: ['referrerId'],
      _count: { referredId: true },
      orderBy: { _count: { referredId: 'desc' } },
      take: 10
    });

    const results = [];
    for (const item of topReferrersRaw) {
      const user = await prisma.user.findUnique({
        where: { id: item.referrerId },
        select: { name: true, email: true, mobile: true }
      });
      
      const rewardsSum = await prisma.referralReward.aggregate({
        where: { referrerId: item.referrerId, status: 'CLAIMED' },
        _sum: { amount: true }
      });
      
      const commissionSum = await prisma.transaction.aggregate({
        where: {
          userId: item.referrerId,
          type: 'REFERRAL_BONUS',
          description: { contains: 'commission' },
          status: 'SUCCESS'
        },
        _sum: { amount: true }
      });

      results.push({
        referrer: user,
        referralsCount: item._count.referredId,
        earnings: (rewardsSum._sum.amount || 0) + (commissionSum._sum.amount || 0),
      });
    }

    return results;
  }

  async getReferralEarningsList() {
    return prisma.transaction.findMany({
      where: {
        type: 'REFERRAL_BONUS',
        status: 'SUCCESS',
      },
      include: {
        user: { select: { name: true, email: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
  }

  /**
   * Get all battles currently in a state requiring AI review / dispute resolution
   */
  async getPendingAIReviews() {
    return prisma.battle.findMany({
      where: {
        status: {
          in: ['RESULT_SUBMITTED', 'PENDING_APPROVAL', 'DISPUTED']
        }
      },
      include: {
        creator: { select: { id: true, name: true, email: true, avatar: true } },
        joiner: { select: { id: true, name: true, email: true, avatar: true } },
        participants: true,
      },
      orderBy: { updatedAt: 'desc' }
    });
  }

  /**
   * Resolve a pending AI review manually by the administrator
   */
  async resolveAIReview(
    adminId: string,
    battleId: string,
    decision: 'APPROVE_AI_WINNER' | 'MANUAL_SETTLE' | 'MANUAL_REFUND' | 'REJECT',
    winnerId?: string,
    adminNotes?: string
  ): Promise<void> {
    const battle = await prisma.battle.findUnique({
      where: { id: battleId },
      include: { participants: true }
    });

    if (!battle) throw new AppError('Battle not found', 404);

    if (
      battle.status !== 'RESULT_SUBMITTED' &&
      battle.status !== 'PENDING_APPROVAL' &&
      battle.status !== 'DISPUTED'
    ) {
      throw new AppError('Battle is not in a resolvable AI review or dispute state', 400);
    }

    // Identify creator and joiner IDs
    const creatorId = battle.createdBy;
    const joinerId = battle.joinedBy;
    if (!joinerId) throw new AppError('Lobby must have an opponent to resolve outcomes', 400);

    if (decision === 'APPROVE_AI_WINNER') {
      const responseJson = battle.aiResponse as any;
      if (!responseJson || !responseJson.winner) {
        throw new AppError('No suggested AI winner available for this battle.', 400);
      }
      
      const aiWinnerName = responseJson.winner.toLowerCase().trim();
      
      // Fetch names to map to user IDs
      const creator = await prisma.user.findUnique({ where: { id: creatorId } });
      const joiner = await prisma.user.findUnique({ where: { id: joinerId } });
      
      if (!creator || !joiner) throw new AppError('Room players not found in database', 404);
      
      const creatorName = creator.name.toLowerCase().trim();
      const joinerName = joiner.name.toLowerCase().trim();
      
      let targetWinnerId: string | null = null;
      if (aiWinnerName.includes(creatorName) || creatorName.includes(aiWinnerName)) {
        targetWinnerId = creatorId;
      } else if (aiWinnerName.includes(joinerName) || joinerName.includes(aiWinnerName)) {
        targetWinnerId = joinerId;
      }
      
      if (!targetWinnerId) {
        throw new AppError(`AI suggested winner "${responseJson.winner}" could not be matched to room participants.`, 400);
      }
      
      winnerId = targetWinnerId;
    }

    if ((decision === 'APPROVE_AI_WINNER' || decision === 'MANUAL_SETTLE') && winnerId) {
      const finalWinnerId = winnerId;
      const finalLoserId = finalWinnerId === creatorId ? joinerId : creatorId;

      await prisma.$transaction(async (tx) => {
        // Update Battle details
        await tx.battle.update({
          where: { id: battleId },
          data: {
            status: 'SETTLED',
            winnerId: finalWinnerId,
            verificationStatus: 'MANUAL_SETTLED',
            verificationTimestamp: new Date(),
            settlementTimestamp: new Date(),
            adminNotes: adminNotes || 'Settled manually by Administrator.'
          }
        });

        // Credit winner winning balance
        const wallet = await tx.wallet.findUnique({ where: { userId: finalWinnerId } });
        if (!wallet) throw new AppError('Winner wallet not found', 404);

        await walletRepository.updateBalanceWithLedger(
          finalWinnerId,
          battle.winnerAmount,
          'WINNING',
          `Battle Victory (Admin Settle): ${battle.title}`,
          undefined,
          tx
        );

        // Referrer commission
        await referralService.processWinningCommission(finalWinnerId, battle.winnerAmount, battle.id, tx);

        // Log win transaction
        await tx.transaction.create({
          data: {
            userId: finalWinnerId,
            walletId: wallet.id,
            amount: battle.winnerAmount,
            type: 'BATTLE_WIN',
            status: 'SUCCESS',
            referenceId: battle.id,
            description: `Won Battle (Admin Settled): "${battle.title}"`,
          }
        });

        // Log platform revenue
        const totalVolume = battle.amount * 2;
        const commissionEarned = totalVolume - battle.winnerAmount;
        await tx.platformRevenue.create({
          data: {
            battleId: battle.id,
            commissionEarned,
            totalBattleVolume: totalVolume,
          }
        });

        // Notifications
        await notificationService.sendNotification(
          finalWinnerId,
          'Battle Settled (Winner)',
          `Admin resolved battle "${battle.title}". You were declared the winner and earned ₹${battle.winnerAmount}.`,
          'BATTLE',
          battle.id
        );

        await notificationService.sendNotification(
          finalLoserId,
          'Battle Settled (Loss)',
          `Admin resolved battle "${battle.title}". Winner: Opponent.`,
          'BATTLE',
          battle.id
        );
      });

      // Emit realtime update
      const updated = await prisma.battle.findUnique({
        where: { id: battleId },
        include: {
          creator: { select: { id: true, name: true, email: true, avatar: true } },
          joiner: { select: { id: true, name: true, email: true, avatar: true } },
          participants: true,
        }
      });
      emitBattleUpdate(battleId, 'battle_settled', updated);

    } else if (decision === 'MANUAL_REFUND' || decision === 'REJECT') {
      await prisma.$transaction(async (tx) => {
        // Update Battle to CANCELLED
        await tx.battle.update({
          where: { id: battleId },
          data: {
            status: 'CANCELLED',
            verificationStatus: decision === 'MANUAL_REFUND' ? 'REFUNDED' : 'REJECTED',
            verificationTimestamp: new Date(),
            settlementTimestamp: new Date(),
            adminNotes: adminNotes || `Battle rejected/refunded manually by Admin.`
          }
        });

        // Refund creator
        const walletCreator = await tx.wallet.findUnique({ where: { userId: creatorId } });
        if (walletCreator) {
          await walletRepository.updateBalanceWithLedger(
            creatorId,
            battle.amount,
            'DEPOSIT',
            `Refund for Cancelled Battle: ${battle.title}`,
            undefined,
            tx
          );
          await tx.transaction.create({
            data: {
              userId: creatorId,
              walletId: walletCreator.id,
              amount: battle.amount,
              type: 'BATTLE_REFUND',
              status: 'SUCCESS',
              referenceId: battle.id,
              description: `Refunded entry fee of ₹${battle.amount} (Admin cancel)`,
            }
          });
        }

        // Refund joiner
        const walletJoiner = await tx.wallet.findUnique({ where: { userId: joinerId } });
        if (walletJoiner) {
          await walletRepository.updateBalanceWithLedger(
            joinerId,
            battle.amount,
            'DEPOSIT',
            `Refund for Cancelled Battle: ${battle.title}`,
            undefined,
            tx
          );
          await tx.transaction.create({
            data: {
              userId: joinerId,
              walletId: walletJoiner.id,
              amount: battle.amount,
              type: 'BATTLE_REFUND',
              status: 'SUCCESS',
              referenceId: battle.id,
              description: `Refunded entry fee of ₹${battle.amount} (Admin cancel)`,
            }
          });
        }

        // Notifications
        await notificationService.sendNotification(
          creatorId,
          'Battle Refunded',
          `Battle "${battle.title}" has been cancelled/refunded by admin. Entry fee of ₹${battle.amount} returned to deposit balance.`,
          'BATTLE',
          battle.id
        );

        await notificationService.sendNotification(
          joinerId,
          'Battle Refunded',
          `Battle "${battle.title}" has been cancelled/refunded by admin. Entry fee of ₹${battle.amount} returned to deposit balance.`,
          'BATTLE',
          battle.id
        );
      });

      // Delete Cloudinary screenshots if cancelled
      for (const part of battle.participants) {
        if (part.screenshotPublicId) {
          await deleteCloudinaryImage(part.screenshotPublicId);
        }
      }

      // Emit realtime update
      const updated = await prisma.battle.findUnique({
        where: { id: battleId },
        include: {
          creator: { select: { id: true, name: true, email: true, avatar: true } },
          joiner: { select: { id: true, name: true, email: true, avatar: true } },
          participants: true,
        }
      });
      emitBattleUpdate(battleId, 'battle_refunded', updated);
    } else {
      throw new AppError('Invalid admin decision action', 400);
    }
  }

  async getFinancialStats() {
    // 1. Deposits aggregation
    const razorpayDeposits = await prisma.transaction.aggregate({
      where: { type: 'DEPOSIT', status: 'SUCCESS' },
      _sum: { amount: true }
    });
    const manualDeposits = await prisma.depositRequest.aggregate({
      where: { status: 'APPROVED' },
      _sum: { amount: true }
    });
    const totalDeposits = (razorpayDeposits._sum.amount || 0) + (manualDeposits._sum.amount || 0);

    // 2. Withdrawals aggregation
    const completedWithdrawals = await prisma.withdrawalRequest.aggregate({
      where: { status: 'APPROVED' },
      _sum: { amount: true }
    });
    const pendingWithdrawalsSum = await prisma.withdrawalRequest.aggregate({
      where: { status: 'PENDING' },
      _sum: { amount: true }
    });
    const failedWithdrawalsSum = await prisma.withdrawalRequest.aggregate({
      where: { status: 'REJECTED' },
      _sum: { amount: true }
    });

    const pendingWithdrawalsCount = await prisma.withdrawalRequest.count({ where: { status: 'PENDING' } });
    const successfulWithdrawalsCount = await prisma.withdrawalRequest.count({ where: { status: 'APPROVED' } });
    const failedWithdrawalsCount = await prisma.withdrawalRequest.count({ where: { status: 'REJECTED' } });

    // 3. Game wagers & wins
    const entryFeesAgg = await prisma.transaction.aggregate({
      where: { type: 'BATTLE_ENTRY', status: 'SUCCESS' },
      _sum: { amount: true }
    });
    const prizeDistributedAgg = await prisma.transaction.aggregate({
      where: { type: 'BATTLE_WIN', status: 'SUCCESS' },
      _sum: { amount: true }
    });

    // 4. Platform commission
    const platformCommissionAgg = await prisma.platformRevenue.aggregate({
      _sum: { commissionEarned: true }
    });
    const totalPlatformCommission = platformCommissionAgg._sum.commissionEarned || 0;

    // 5. Referral & Welcome bonuses
    const referralBonusAgg = await prisma.transaction.aggregate({
      where: { type: 'REFERRAL_BONUS', status: 'SUCCESS' },
      _sum: { amount: true }
    });
    const totalReferralBonus = referralBonusAgg._sum.amount || 0;

    // Welcome bonuses can be tracked separately if they have 'Welcome' in description
    const welcomeBonusAgg = await prisma.transaction.aggregate({
      where: {
        type: 'REFERRAL_BONUS',
        status: 'SUCCESS',
        description: { contains: 'Welcome' }
      },
      _sum: { amount: true }
    });
    const totalWelcomeBonus = welcomeBonusAgg._sum.amount || 0;
    const promotionalRewards = totalReferralBonus; // Welcome bonus is subset of REFERRAL_BONUS in this schema

    // 6. Net balances
    const walletsBalances = await prisma.wallet.aggregate({
      _sum: {
        depositBalance: true,
        winningBalance: true,
        bonusBalance: true
      }
    });
    const netWalletBalance = 
      (walletsBalances._sum.depositBalance || 0) + 
      (walletsBalances._sum.winningBalance || 0) + 
      (walletsBalances._sum.bonusBalance || 0);

    // Company Profit
    const totalCompanyProfit = totalPlatformCommission - totalReferralBonus;

    // Calculate periodic profits (commission - referral bonus in that period)
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - 7);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const getProfitInPeriod = async (startDate: Date) => {
      const comm = await prisma.platformRevenue.aggregate({
        where: { createdAt: { gte: startDate } },
        _sum: { commissionEarned: true }
      });
      const ref = await prisma.transaction.aggregate({
        where: { type: 'REFERRAL_BONUS', status: 'SUCCESS', createdAt: { gte: startDate } },
        _sum: { amount: true }
      });
      return (comm._sum.commissionEarned || 0) - (ref._sum.amount || 0);
    };

    const todayProfit = await getProfitInPeriod(startOfToday);
    const weeklyProfit = await getProfitInPeriod(startOfWeek);
    const monthlyProfit = await getProfitInPeriod(startOfMonth);

    // 7. Charts data
    // Fetch last 30 days of data for daily trends
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dailyRevenueData = await prisma.platformRevenue.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { commissionEarned: true, createdAt: true }
    });

    const dailyDepositsData = await prisma.transaction.findMany({
      where: { type: 'DEPOSIT', status: 'SUCCESS', createdAt: { gte: thirtyDaysAgo } },
      select: { amount: true, createdAt: true }
    });
    const dailyManualDeposits = await prisma.depositRequest.findMany({
      where: { status: 'APPROVED', processedAt: { gte: thirtyDaysAgo } },
      select: { amount: true, processedAt: true }
    });

    const dailyWithdrawalsData = await prisma.withdrawalRequest.findMany({
      where: { status: 'APPROVED', processedAt: { gte: thirtyDaysAgo } },
      select: { amount: true, processedAt: true }
    });

    // Group daily metrics in JS
    const dailyTrends: Record<string, { date: string; revenue: number; deposit: number; withdrawal: number; profit: number }> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      dailyTrends[dateStr] = { date: dateStr, revenue: 0, deposit: 0, withdrawal: 0, profit: 0 };
    }

    dailyRevenueData.forEach(r => {
      const dateStr = r.createdAt.toISOString().split('T')[0];
      if (dailyTrends[dateStr]) {
        dailyTrends[dateStr].revenue += r.commissionEarned;
        dailyTrends[dateStr].profit += r.commissionEarned;
      }
    });

    dailyDepositsData.forEach(d => {
      const dateStr = d.createdAt.toISOString().split('T')[0];
      if (dailyTrends[dateStr]) {
        dailyTrends[dateStr].deposit += d.amount;
      }
    });
    dailyManualDeposits.forEach(d => {
      if (d.processedAt) {
        const dateStr = d.processedAt.toISOString().split('T')[0];
        if (dailyTrends[dateStr]) {
          dailyTrends[dateStr].deposit += d.amount;
        }
      }
    });

    dailyWithdrawalsData.forEach(w => {
      if (w.processedAt) {
        const dateStr = w.processedAt.toISOString().split('T')[0];
        if (dailyTrends[dateStr]) {
          dailyTrends[dateStr].withdrawal += w.amount;
        }
      }
    });

    const dailyTrendList = Object.values(dailyTrends).sort((a, b) => a.date.localeCompare(b.date));

    // Top Revenue Days (highest platform revenue grouped by day)
    const topRevenueDays = [...dailyTrendList]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    return {
      totalDeposits,
      totalWithdrawals: completedWithdrawals._sum.amount || 0,
      pendingWithdrawals: pendingWithdrawalsSum._sum.amount || 0,
      successfulWithdrawals: completedWithdrawals._sum.amount || 0,
      failedWithdrawals: failedWithdrawalsSum._sum.amount || 0,
      pendingWithdrawalsCount,
      successfulWithdrawalsCount,
      failedWithdrawalsCount,
      totalEntryFees: entryFeesAgg._sum.amount || 0,
      totalPrizeDistributed: prizeDistributedAgg._sum.amount || 0,
      totalPlatformCommission,
      totalCompanyProfit,
      todayProfit,
      weeklyProfit,
      monthlyProfit,
      netWalletBalance,
      totalCashbackGiven: totalWelcomeBonus,
      referralBonusPaid: totalReferralBonus,
      promotionalRewards,
      dailyTrendList,
      topRevenueDays
    };
  }

  async getUsersDetailed() {
    const users = await prisma.user.findMany({
      where: { role: 'USER' },
      include: {
        wallet: true,
        participants: {
          include: {
            battle: true
          }
        },
        devices: {
          orderBy: { lastActive: 'desc' },
          take: 1
        },
        loginHistories: {
          orderBy: { timestamp: 'desc' },
          take: 1
        },
        transactions: {
          where: { status: 'SUCCESS' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return users.map(user => {
      const totalBattles = user.participants.length;
      const completedBattles = user.participants.filter(p => p.battle.status === 'COMPLETED' || p.battle.status === 'SETTLED');
      const winsCount = user.participants.filter(p => p.battle.winnerId === user.id).length;
      const lossesCount = completedBattles.length - winsCount;
      const winRate = completedBattles.length > 0 ? Math.round((winsCount / completedBattles.length) * 100) : 0;

      const totalDeposits = user.transactions
        .filter(t => t.type === 'DEPOSIT')
        .reduce((sum, t) => sum + t.amount, 0);

      const totalWithdrawals = user.transactions
        .filter(t => t.type === 'WITHDRAW')
        .reduce((sum, t) => sum + t.amount, 0);

      const profitGenerated = user.participants.reduce((sum, p) => {
        if (p.battle.status === 'COMPLETED' || p.battle.status === 'SETTLED') {
          const totalVol = p.battle.amount * 2;
          const fee = totalVol - p.battle.winnerAmount;
          return sum + (fee / 2);
        }
        return sum;
      }, 0);

      const lastLoginHistory = user.loginHistories[0] || null;
      const currentDevice = user.devices[0] || null;

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        avatar: user.avatar || '',
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
        wallet: user.wallet ? {
          depositBalance: user.wallet.depositBalance,
          winningBalance: user.wallet.winningBalance,
          bonusBalance: user.wallet.bonusBalance
        } : { depositBalance: 0, winningBalance: 0, bonusBalance: 0 },
        referralEarnings: user.transactions
          .filter(t => t.type === 'REFERRAL_BONUS')
          .reduce((sum, t) => sum + t.amount, 0),
        lastLogin: lastLoginHistory ? lastLoginHistory.timestamp : null,
        ipAddress: lastLoginHistory ? lastLoginHistory.ipAddress : 'N/A',
        device: currentDevice ? currentDevice.platform : 'N/A',
        country: 'India',
        totalBattles,
        totalWins: winsCount,
        totalLosses: lossesCount,
        winRate,
        depositAmount: totalDeposits,
        withdrawalAmount: totalWithdrawals,
        profitGenerated
      };
    });
  }

  async getBattlesDetailed() {
    return prisma.battle.findMany({
      include: {
        creator: { select: { name: true, email: true } },
        joiner: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async getScreenshotsDetailed() {
    const participantsWithScreenshots = await prisma.battleParticipant.findMany({
      where: { screenshotUrl: { not: null } },
      include: {
        user: { select: { id: true, name: true, email: true } },
        battle: {
          select: {
            id: true,
            title: true,
            status: true,
            aiConfidence: true,
            aiResponse: true,
            adminNotes: true,
            verificationStatus: true
          }
        }
      },
      orderBy: { resultSubmittedAt: 'desc' }
    });

    return participantsWithScreenshots.map(p => ({
      id: p.id,
      battleId: p.battleId,
      battleTitle: p.battle.title,
      battleStatus: p.battle.status,
      uploaderId: p.userId,
      uploaderName: p.user.name,
      uploaderEmail: p.user.email,
      uploadTime: p.resultSubmittedAt || p.createdAt,
      screenshotUrl: p.screenshotUrl,
      screenshotPublicId: p.screenshotPublicId,
      aiConfidence: p.battle.aiConfidence,
      aiResponse: p.battle.aiResponse,
      adminDecision: p.battle.verificationStatus,
      adminNotes: p.battle.adminNotes
    }));
  }

  async getTransactionsDetailed() {
    return prisma.transaction.findMany({
      include: {
        user: { select: { name: true, email: true, mobile: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async getAuditLogs() {
    return prisma.adminAuditLog.findMany({
      orderBy: { createdAt: 'desc' }
    });
  }

  async logAdminAction(adminId: string, action: string, ip?: string, device?: string) {
    const adminUser = await prisma.user.findUnique({ where: { id: adminId } });
    const adminName = adminUser ? adminUser.name : 'System';
    return prisma.adminAuditLog.create({
      data: {
        adminId,
        adminName,
        action,
        ip: ip || 'unknown',
        device: device || 'web'
      }
    });
  }

  async sendGlobalNotification(adminId: string, data: any) {
    const { userIds, title, body, type } = data;
    let targets: string[] = [];
    if (userIds === 'all') {
      const allUsers = await prisma.user.findMany({
        where: { role: 'USER' },
        select: { id: true }
      });
      targets = allUsers.map(u => u.id);
    } else if (Array.isArray(userIds)) {
      targets = userIds;
    }

    for (const userId of targets) {
      await notificationService.sendNotification(userId, title, body, type || 'SYSTEM');
    }
  }
}

export const adminService = new AdminService();
export default adminService;


