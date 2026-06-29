import prisma from '../database/db';
import battleRepository from '../repositories/BattleRepository';
import walletRepository from '../repositories/WalletRepository';
import AppError from '../utils/AppError';
import notificationService from '../notifications/NotificationService';
import { emitBattleUpdate } from '../socket/socket';
import { Prisma, BattleStatus } from '@prisma/client';
import { systemSettingsCache } from '../modules/system-settings/SystemSettingsCache';

export class BattleService {
  private async generateUniqueInviteCode(tx: Prisma.TransactionClient): Promise<string> {
    let inviteCode = '';
    let exists = true;
    let attempts = 0;

    while (exists && attempts < 20) {
      attempts++;
      const randomDigits = Math.floor(100000 + Math.random() * 900000).toString();
      inviteCode = `LK${randomDigits}`;
      
      const battle = await tx.battle.findUnique({
        where: { inviteCode }
      });
      if (!battle) {
        exists = false;
      }
    }
    
    if (exists) {
      inviteCode = `LK${Date.now().toString().slice(-6)}`;
    }
    
    return inviteCode;
  }

  // Deduct entry fee prioritizing Bonus balance, then Deposit balance, then Winning balance
  private async deductEntryFee(userId: string, entryFee: number, battleId: string, tx: Prisma.TransactionClient): Promise<string> {
    const wallet = await tx.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new AppError('Wallet not found', 404);

    const totalAvailable = wallet.depositBalance + wallet.winningBalance + wallet.bonusBalance;
    if (totalAvailable < entryFee) {
      throw new AppError('Insufficient balance to join this battle', 400);
    }

    let remainingFee = entryFee;
    let bonusDeduct = 0;
    let depositDeduct = 0;
    let winningDeduct = 0;

    // 1. Consume bonus first
    if (wallet.bonusBalance >= remainingFee) {
      bonusDeduct = remainingFee;
      remainingFee = 0;
    } else {
      bonusDeduct = wallet.bonusBalance;
      remainingFee -= bonusDeduct;
    }

    // 2. Consume deposit next
    if (remainingFee > 0) {
      if (wallet.depositBalance >= remainingFee) {
        depositDeduct = remainingFee;
        remainingFee = 0;
      } else {
        depositDeduct = wallet.depositBalance;
        remainingFee -= depositDeduct;
      }
    }

    // 3. Consume winning last
    if (remainingFee > 0) {
      winningDeduct = remainingFee;
      remainingFee = 0;
    }

    // Deduct bonus balance
    if (bonusDeduct > 0) {
      await walletRepository.updateBalanceWithLedger(
        userId,
        -bonusDeduct,
        'BONUS',
        `Entry fee for Battle ID: ${battleId}`,
        undefined,
        tx
      );
    }

    // Deduct deposit balance
    if (depositDeduct > 0) {
      await walletRepository.updateBalanceWithLedger(
        userId,
        -depositDeduct,
        'DEPOSIT',
        `Entry fee for Battle ID: ${battleId}`,
        undefined,
        tx
      );
    }

    // Deduct winning balance
    if (winningDeduct > 0) {
      await walletRepository.updateBalanceWithLedger(
        userId,
        -winningDeduct,
        'WINNING',
        `Entry fee for Battle ID: ${battleId}`,
        undefined,
        tx
      );
    }

    // Record entry transaction
    const transaction = await tx.transaction.create({
      data: {
        userId,
        walletId: wallet.id,
        amount: entryFee,
        type: 'BATTLE_ENTRY',
        status: 'SUCCESS',
        referenceId: battleId,
        description: `Deducted entry fee of ₹${entryFee} (Bonus: ₹${bonusDeduct}, Deposit: ₹${depositDeduct}, Winning: ₹${winningDeduct})`,
      },
    });

    return transaction.id;
  }

  private async refundEntryFee(userId: string, entryFee: number, battleId: string, tx: Prisma.TransactionClient): Promise<void> {
    const wallet = await tx.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new AppError('Wallet not found', 404);

    // Refund entry fee back to Deposit balance
    await walletRepository.updateBalanceWithLedger(
      userId,
      entryFee,
      'DEPOSIT',
      `Refund for cancelled Battle ID: ${battleId}`,
      undefined,
      tx
    );

    // Create refund transaction
    await tx.transaction.create({
      data: {
        userId,
        walletId: wallet.id,
        amount: entryFee,
        type: 'BATTLE_REFUND',
        status: 'SUCCESS',
        referenceId: battleId,
        description: `Refunded entry fee of ₹${entryFee} due to battle cancellation`,
      },
    });
  }

  async createBattle(userId: string, data: any): Promise<any> {
    const battleCreationEnabled = systemSettingsCache.getBoolean('BATTLE_CREATION_ENABLED', true);
    if (!battleCreationEnabled) {
      throw new AppError('Battle creation is currently disabled by administrator.', 403);
    }

    const { title, amount, inviteCode } = data;

    // Enforce stake limits
    const minBattleAmount = systemSettingsCache.getNumber('MIN_BATTLE_AMOUNT', 50);
    const maxBattleAmount = systemSettingsCache.getNumber('MAX_BATTLE_AMOUNT', 20000);
    if (amount < minBattleAmount || amount > maxBattleAmount) {
      throw new AppError(`Battle stake amount must be between ₹${minBattleAmount} and ₹${maxBattleAmount}`, 400);
    }

    return prisma.$transaction(async (tx) => {
      // Fetch dynamic commission percentage setting
      const commissionPct = systemSettingsCache.getNumber('COMMISSION_PERCENTAGE', 10);
      const commissionAmount = (amount * commissionPct) / 100;
      const winnerAmount = amount * 2 - commissionAmount;

      if (inviteCode && inviteCode.trim() !== '') {
        const existing = await tx.battle.findUnique({
          where: { inviteCode }
        });
        if (existing) {
          throw new AppError('Invite code already in use', 400);
        }
      }

      // Create Battle
      const newBattle = await tx.battle.create({
        data: {
          title,
          amount,
          commission: commissionPct,
          winnerAmount,
          inviteCode: (inviteCode && inviteCode.trim() !== '') ? inviteCode : null,
          createdBy: userId,
          status: 'OPEN',
        },
      });

      // Deduct entry fee
      await this.deductEntryFee(userId, amount, newBattle.id, tx);

      // Create BattleParticipant entry
      await tx.battleParticipant.create({
        data: {
          battleId: newBattle.id,
          userId: userId,
          role: 'CREATOR',
        },
      });

      // Fetch with relation mappings to support websocket updates
      const result = await tx.battle.findUnique({
        where: { id: newBattle.id },
        include: {
          creator: { select: { id: true, name: true, email: true, avatar: true } },
          participants: true,
        },
      });

      emitBattleUpdate(newBattle.id, 'battle_created', result);

      return result;
    });
  }


  // Transactional Battle Join
  async joinBattle(userId: string, battleId: string): Promise<any> {
    return prisma.$transaction(async (tx) => {
      const battle = await tx.battle.findUnique({ where: { id: battleId } });
      if (!battle) throw new AppError('Battle not found', 404);

      if (battle.status !== 'OPEN') {
        throw new AppError('Battle is no longer open', 400);
      }

      if (battle.createdBy === userId) {
        throw new AppError('You cannot join your own battle', 400);
      }

      // Deduct entry fee
      await this.deductEntryFee(userId, battle.amount, battle.id, tx);

      // Join battle and transition to IN_PROGRESS
      const updatedBattle = await tx.battle.update({
        where: { id: battleId },
        data: {
          joinedBy: userId,
          status: 'IN_PROGRESS',
        },
        include: {
          creator: { select: { id: true, name: true, email: true, avatar: true } },
          joiner: { select: { id: true, name: true, email: true, avatar: true } },
        },
      });

      // Create Participant entry
      await tx.battleParticipant.create({
        data: {
          battleId: battle.id,
          userId: userId,
          role: 'JOINER',
        },
      });

      await notificationService.sendNotification(
        battle.createdBy,
        'Opponent Joined Battle',
        `An opponent joined your battle "${battle.title}". The match is now in progress!`,
        'BATTLE',
        battle.id
      );

      emitBattleUpdate(battle.id, 'battle_joined', updatedBattle);

      return updatedBattle;
    });
  }

  // Transactional Battle cancel
  async cancelBattle(userId: string, battleId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const battle = await tx.battle.findUnique({ where: { id: battleId } });
      if (!battle) throw new AppError('Battle not found', 404);

      if (battle.createdBy !== userId) {
        throw new AppError('Only the creator can cancel this battle', 403);
      }

      if (battle.status !== 'OPEN') {
        throw new AppError('You can only cancel open battles', 400);
      }

      const updated = await tx.battle.update({
        where: { id: battleId },
        data: { status: 'CANCELLED' },
      });

      // Refund the creator
      await this.refundEntryFee(userId, battle.amount, battle.id, tx);

      emitBattleUpdate(battle.id, 'battle_cancelled', updated);
    });
  }

  async getBattleDetails(battleId: string) {
    const battle = await battleRepository.findById(battleId);
    if (!battle) throw new AppError('Battle not found', 404);
    return battle;
  }

  async getOpenBattles() {
    return battleRepository.find({ status: 'OPEN' });
  }

  async getActiveBattles() {
    return battleRepository.find({ status: { in: ['JOINED', 'IN_PROGRESS', 'RESULT_SUBMITTED', 'DISPUTED'] } });
  }

  async getCompletedBattles() {
    return battleRepository.find({ status: 'COMPLETED' });
  }

  async getBattleHistory(userId: string) {
    return battleRepository.find({
      OR: [{ createdBy: userId }, { joinedBy: userId }],
    });
  }

  async setInviteCode(userId: string, battleId: string, inviteCode: string): Promise<any> {
    if (!inviteCode || inviteCode.trim() === '') {
      throw new AppError('Invite code cannot be empty', 400);
    }

    const battle = await prisma.battle.findUnique({
      where: { id: battleId }
    });

    if (!battle) {
      throw new AppError('Battle not found', 404);
    }

    if (battle.createdBy !== userId) {
      throw new AppError('Only the creator can set the invite code', 403);
    }

    // Check if invite code is already taken
    const existing = await prisma.battle.findUnique({
      where: { inviteCode }
    });
    if (existing && existing.id !== battleId) {
      throw new AppError('Invite code already in use', 400);
    }

    const updated = await prisma.battle.update({
      where: { id: battleId },
      data: { inviteCode },
      include: {
        creator: { select: { id: true, name: true, email: true, avatar: true } },
        joiner: { select: { id: true, name: true, email: true, avatar: true } },
      }
    });

    // Notify opponent that the invite code has been set
    if (battle.joinedBy) {
      await notificationService.sendNotification(
        battle.joinedBy,
        'Invite Code Updated',
        `The creator has set the Ludo King invite code to: ${inviteCode}. Join the room now!`,
        'BATTLE',
        battleId
      );
    }

    emitBattleUpdate(battleId, 'battle_invite_code_updated', updated);

    return updated;
  }
}

export const battleService = new BattleService();
export default battleService;
