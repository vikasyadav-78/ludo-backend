import prisma from '../database/db';
import walletRepository from '../repositories/WalletRepository';
import AppError from '../utils/AppError';
import notificationService from '../notifications/NotificationService';
import { emitBattleUpdate } from '../socket/socket';
import { Prisma, BattleStatus, ResultStatus, AdminDecision } from '@prisma/client';
import referralService from './ReferralService';


export class ResultService {
  async submitResult(
    userId: string,
    battleId: string,
    resultType: 'WIN' | 'LOSS' | 'CANCEL',
    screenshotUrl?: string,
    screenshotPublicId?: string
  ): Promise<any> {
    return prisma.$transaction(async (tx) => {
      const battle = await tx.battle.findUnique({ where: { id: battleId } });
      if (!battle) throw new AppError('Battle not found', 404);

      if (battle.status !== 'IN_PROGRESS' && battle.status !== 'RESULT_SUBMITTED') {
        throw new AppError('Results cannot be submitted at this stage', 400);
      }

      // Check if user is participant
      const participant = await tx.battleParticipant.findUnique({
        where: {
          battleId_userId: { battleId, userId },
        },
      });

      if (!participant) {
        throw new AppError('User is not a participant of this battle', 403);
      }

      if (participant.submittedResult) {
        throw new AppError('You have already submitted a result for this battle', 400);
      }

      // Register user submission
      const updatedParticipant = await tx.battleParticipant.update({
        where: { id: participant.id },
        data: {
          submittedResult: resultType as ResultStatus,
          screenshotUrl,
          screenshotPublicId,
          resultSubmittedAt: new Date(),
        },
      });

      // Save BattleResult audit trail
      await tx.battleResult.create({
        data: {
          battleId: battle.id,
          submittedBy: userId,
          screenshotUrl,
          screenshotPublicId,
          status: resultType as ResultStatus,
        },
      });

      // Check other participant
      const opponentId = battle.createdBy === userId ? battle.joinedBy : battle.createdBy;
      if (!opponentId) throw new AppError('Opponent not found', 400);

      const opponent = await tx.battleParticipant.findUnique({
        where: {
          battleId_userId: { battleId, userId: opponentId },
        },
      });

      if (!opponent || !opponent.submittedResult) {
        // Only one user has submitted so far
        const updatedBattle = await tx.battle.update({
          where: { id: battleId },
          data: { status: 'RESULT_SUBMITTED' },
          include: {
            creator: { select: { id: true, name: true, email: true, avatar: true } },
            joiner: { select: { id: true, name: true, email: true, avatar: true } },
            participants: true,
          },
        });
        emitBattleUpdate(battle.id, 'result_submitted', { battle: updatedBattle, userId });
        return { message: 'Result submitted. Waiting for opponent submission.', triggerAI: false };
      }

      // Both have submitted! Let's check for mutual agreement
      const creatorPart = battle.createdBy === userId ? updatedParticipant : opponent;
      const joinerPart = battle.joinedBy === userId ? updatedParticipant : opponent;

      const creatorReport = creatorPart.submittedResult;
      const joinerReport = joinerPart.submittedResult;

      // 1. Mutual cancellation agreement
      if (creatorReport === 'CANCEL' && joinerReport === 'CANCEL') {
        await this.resolveCancellation(battle, tx);
        return { message: 'Battle cancelled by mutual agreement. Wagers refunded.', triggerAI: false };
      }

      // 2. Mutual winner/loser agreement
      if (creatorReport === 'WIN' && joinerReport === 'LOSS') {
        await this.resolveWinner(battle, battle.createdBy, battle.joinedBy!, tx);
        return { message: 'Battle settled successfully by mutual agreement.', triggerAI: false };
      }

      if (creatorReport === 'LOSS' && joinerReport === 'WIN') {
        await this.resolveWinner(battle, battle.joinedBy!, battle.createdBy, tx);
        return { message: 'Battle settled successfully by mutual agreement.', triggerAI: false };
      }

      // 3. Conflicting results (e.g. WIN/WIN, LOSS/LOSS, WIN/CANCEL, etc.) -> AI verification triggers
      const updatedBattle = await tx.battle.update({
        where: { id: battleId },
        data: { status: 'RESULT_SUBMITTED' },
        include: {
          creator: { select: { id: true, name: true, email: true, avatar: true } },
          joiner: { select: { id: true, name: true, email: true, avatar: true } },
          participants: true,
        },
      });

      emitBattleUpdate(battle.id, 'result_submitted', { battle: updatedBattle, userId });

      return {
        message: 'Conflicting results. AI verification in progress.',
        triggerAI: true
      };
    });
  }


  private async resolveWinner(battle: any, winnerId: string, loserId: string, tx: Prisma.TransactionClient) {
    await tx.battle.update({
      where: { id: battle.id },
      data: {
        status: 'COMPLETED',
        winnerId: winnerId,
      },
    });

    const wallet = await tx.wallet.findUnique({ where: { userId: winnerId } });
    if (!wallet) throw new AppError('Winner wallet not found', 404);

    // Credit winner amount to winning balance
    await walletRepository.updateBalanceWithLedger(
      winnerId,
      battle.winnerAmount,
      'WINNING',
      `Battle Victory: ${battle.title}`,
      undefined,
      tx
    );

    // Process referrer commission reward (0.5% winning commission)
    await referralService.processWinningCommission(winnerId, battle.winnerAmount, battle.id, tx);


    // Record battle win transaction
    await tx.transaction.create({
      data: {
        userId: winnerId,
        walletId: wallet.id,
        amount: battle.winnerAmount,
        type: 'BATTLE_WIN',
        status: 'SUCCESS',
        referenceId: battle.id,
        description: `Won Battle: "${battle.title}"`,
      },
    });

    // Record Platform Revenue
    const totalVolume = battle.amount * 2;
    const commissionEarned = totalVolume - battle.winnerAmount;
    await tx.platformRevenue.create({
      data: {
        battleId: battle.id,
        commissionEarned,
        totalBattleVolume: totalVolume,
      },
    });

    // Send notifications
    await notificationService.sendNotification(
      winnerId,
      'You Won the Battle!',
      `Congratulations! You won the battle "${battle.title}" and earned ₹${battle.winnerAmount}.`,
      'BATTLE',
      battle.id
    );

    await notificationService.sendNotification(
      loserId,
      'Battle Lost',
      `You lost the battle "${battle.title}". Better luck next time!`,
      'BATTLE',
      battle.id
    );
  }

  private async resolveCancellation(battle: any, tx: Prisma.TransactionClient) {
    await tx.battle.update({
      where: { id: battle.id },
      data: { status: 'CANCELLED' },
    });

    // Refund creator
    await walletRepository.updateBalanceWithLedger(
      battle.createdBy,
      battle.amount,
      'DEPOSIT',
      `Refund for cancelled Battle: ${battle.title}`,
      undefined,
      tx
    );

    // Refund joiner
    if (battle.joinedBy) {
      await walletRepository.updateBalanceWithLedger(
        battle.joinedBy,
        battle.amount,
        'DEPOSIT',
        `Refund for cancelled Battle: ${battle.title}`,
        undefined,
        tx
      );
    }

    // Send notifications
    await notificationService.sendNotification(
      battle.createdBy,
      'Battle Cancelled',
      `Battle "${battle.title}" was cancelled and entry fee refunded.`,
      'BATTLE',
      battle.id
    );

    if (battle.joinedBy) {
      await notificationService.sendNotification(
        battle.joinedBy,
        'Battle Cancelled',
        `Battle "${battle.title}" was cancelled and entry fee refunded.`,
        'BATTLE',
        battle.id
      );
    }
  }
}

export const resultService = new ResultService();
export default resultService;
