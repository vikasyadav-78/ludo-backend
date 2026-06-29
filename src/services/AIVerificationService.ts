import prisma from '../database/db';
import geminiService from './GeminiService';
import walletRepository from '../repositories/WalletRepository';
import referralService from './ReferralService';
import notificationService from '../notifications/NotificationService';
import { emitBattleUpdate } from '../socket/socket';
import { logger } from '../config/logger';
import { BattleStatus } from '@prisma/client';
import { systemSettingsCache } from '../modules/system-settings/SystemSettingsCache';

export class AIVerificationService {
  /**
   * Triggers the AI verification in the background (non-blocking)
   */
  async verifyBattleResult(battleId: string): Promise<void> {
    const isAiEnabled = systemSettingsCache.getBoolean('AI_VERIFICATION_ENABLED', true);
    if (!isAiEnabled) {
      logger.info(`AI Verification is disabled. Marking Battle: ${battleId} as PENDING_APPROVAL.`);
      await prisma.battle.update({
        where: { id: battleId },
        data: {
          status: 'PENDING_APPROVAL',
          verificationStatus: 'FAILED',
          adminNotes: 'AI Verification is disabled by administrator. Pending manual approval.'
        }
      });
      emitBattleUpdate(battleId, 'battle_pending_approval', { id: battleId, status: 'PENDING_APPROVAL' });
      return;
    }

    // Run verification asynchronously
    setTimeout(async () => {
      try {
        logger.info(`Starting background AI verification for Battle: ${battleId}`);
        await this.runVerification(battleId);
      } catch (error: any) {
        logger.error(`Error in background AI verification for Battle ${battleId}:`, error);
      }
    }, 100);
  }

  /**
   * Internal logic for downloading, analyzing, and settling/disputing the battle
   */
  private async runVerification(battleId: string): Promise<void> {
    // 1. Fetch battle details with participants
    const battle = await prisma.battle.findUnique({
      where: { id: battleId },
      include: {
        creator: { select: { id: true, name: true } },
        joiner: { select: { id: true, name: true } },
        participants: true,
      }
    });

    if (!battle) {
      logger.error(`AI Verification aborted: Battle ${battleId} not found in database.`);
      return;
    }

    if (battle.status !== 'RESULT_SUBMITTED') {
      logger.info(`AI Verification aborted: Battle ${battleId} is in status ${battle.status}, expected RESULT_SUBMITTED.`);
      return;
    }

    // 2. Identify the screenshots and selections of both players
    const creatorPart = battle.participants.find(p => p.role === 'CREATOR');
    const joinerPart = battle.participants.find(p => p.role === 'JOINER');

    if (!creatorPart || !joinerPart) {
      logger.error(`AI Verification aborted: Missing participant details for Battle ${battleId}.`);
      return;
    }

    const urlA = creatorPart.screenshotUrl;
    const urlB = joinerPart.screenshotUrl;

    if (!urlA || !urlB) {
      logger.warn(`AI Verification: Missing screenshot URLs for Battle ${battleId}. Transitioning to DISPUTED.`);
      await this.markAsDisputed(battleId, 'Missing screenshot proof from one or both players.', 0, null);
      return;
    }

    // 3. Call Gemini Vision API to analyze screenshots
    let aiResponse;
    try {
      aiResponse = await geminiService.analyzeScreenshots(urlA, urlB);
    } catch (apiError: any) {
      logger.error(`Gemini Vision API error for Battle ${battleId}:`, apiError);
      // On Gemini failure, transition to PENDING_APPROVAL for admin manual verification
      await prisma.battle.update({
        where: { id: battleId },
        data: {
          status: 'PENDING_APPROVAL',
          verificationStatus: 'FAILED',
          adminNotes: `AI analysis failed: ${apiError.message || 'API error'}`
        }
      });
      emitBattleUpdate(battleId, 'battle_pending_approval', { id: battleId, status: 'PENDING_APPROVAL' });
      return;
    }

    logger.info(`AI Analysis completed for Battle ${battleId}. Confidence: ${aiResponse.confidence}%`);

    // 4. Apply Auto-Settlement and Dispute Rules
    const {
      isLudoKing,
      winner,
      loser,
      roomCode,
      editedImage,
      blurredImage,
      confidence,
      reason
    } = aiResponse;

    const creatorName = battle.creator.name.toLowerCase().trim();
    const joinerName = battle.joiner?.name.toLowerCase().trim() || '';

    // Match detected winner to database user IDs
    let detectedWinnerId: string | null = null;
    let detectedLoserId: string | null = null;

    if (winner) {
      const winnerNameLower = winner.toLowerCase().trim();
      // Fuzzy check/substring check since player names in Ludo King may slightly vary
      if (winnerNameLower.includes(creatorName) || creatorName.includes(winnerNameLower)) {
        detectedWinnerId = battle.createdBy;
        detectedLoserId = battle.joinedBy;
      } else if (joinerName && (winnerNameLower.includes(joinerName) || joinerName.includes(winnerNameLower))) {
        detectedWinnerId = battle.joinedBy;
        detectedLoserId = battle.createdBy;
      }
    }

    // Auto-settlement criteria checks
    const hasHighConfidence = confidence >= 95;
    const isGameLudoKing = isLudoKing;
    const isNotEdited = !editedImage;
    const isNotBlurred = !blurredImage;
    const hasDetectedWinner = detectedWinnerId !== null;

    // Both players screenshots must agree on the declared status
    // Creator reported result
    const creatorReport = creatorPart.submittedResult; // WIN, LOSS, CANCEL
    // Joiner reported result
    const joinerReport = joinerPart.submittedResult; // WIN, LOSS, CANCEL

    // Check mutual agreement: Creator claims Win, Joiner claims Loss, OR vice versa
    const playersAgree = 
      (creatorReport === 'WIN' && joinerReport === 'LOSS') ||
      (creatorReport === 'LOSS' && joinerReport === 'WIN');

    const expectedWinnerId = creatorReport === 'WIN' ? battle.createdBy : battle.joinedBy;

    // AI winner must match the agreed winner from the reports
    const aiWinnerMatchesAgreedWinner = detectedWinnerId === expectedWinnerId;

    // Room code check if roomCode is detected and invite code exists
    let roomCodeMatches = true;
    if (roomCode && battle.inviteCode) {
      // Clean codes of spaces, non-alphanumeric, and LK prefix to compare
      const cleanRoom = roomCode.replace(/[^0-9]/g, '');
      const cleanInvite = battle.inviteCode.replace(/[^0-9]/g, '');
      if (cleanRoom && cleanInvite && !cleanRoom.includes(cleanInvite) && !cleanInvite.includes(cleanRoom)) {
        roomCodeMatches = false;
      }
    }

    const canAutoSettle = 
      isGameLudoKing &&
      hasHighConfidence &&
      hasDetectedWinner &&
      playersAgree &&
      aiWinnerMatchesAgreedWinner &&
      isNotEdited &&
      isNotBlurred &&
      roomCodeMatches;

    if (canAutoSettle && detectedWinnerId && detectedLoserId) {
      // 5. Execute transactional auto-settlement
      logger.info(`AI Auto-settling Battle ${battleId} -> Winner: ${detectedWinnerId}`);
      await this.settleBattle(battle, detectedWinnerId, detectedLoserId, confidence, aiResponse);
    } else {
      // 6. Handle Disputes & Manual Reviews
      let disputeReason = '';
      if (!isGameLudoKing) disputeReason += 'Screenshot does not appear to be Ludo King. ';
      if (!hasHighConfidence) disputeReason += `Low AI confidence (${confidence}% < 95%). `;
      if (!hasDetectedWinner) disputeReason += `Could not match detected winner "${winner}" to room participants. `;
      if (!playersAgree) disputeReason += 'Players submitted conflicting results. ';
      if (!aiWinnerMatchesAgreedWinner) disputeReason += 'AI winner mismatch with player reports. ';
      if (editedImage) disputeReason += 'AI detected potential image manipulation. ';
      if (blurredImage) disputeReason += 'Screenshot image is unreadable or blurred. ';
      if (!roomCodeMatches) disputeReason += `Room code mismatch (AI: ${roomCode}, Invite: ${battle.inviteCode}). `;

      logger.info(`AI Verification failed for Battle ${battleId}. Reason: ${disputeReason}. Marking as DISPUTED.`);
      await this.markAsDisputed(battleId, disputeReason || reason || 'AI verification mismatch.', confidence, aiResponse);
    }
  }

  /**
   * Settle the battle transactionally, update wallets, and save AI details
   */
  private async settleBattle(
    battle: any,
    winnerId: string,
    loserId: string,
    confidence: number,
    aiResponse: any
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // 1. Update battle status to SETTLED
      await tx.battle.update({
        where: { id: battle.id },
        data: {
          status: 'SETTLED',
          winnerId,
          aiConfidence: confidence,
          aiResponse: aiResponse as any,
          verificationStatus: 'AUTO_SETTLED',
          verificationTimestamp: new Date(),
          settlementTimestamp: new Date(),
          adminNotes: 'Auto-settled successfully by Gemini AI.'
        }
      });

      // 2. Fetch winner wallet
      const wallet = await tx.wallet.findUnique({ where: { userId: winnerId } });
      if (!wallet) throw new Error('Winner wallet not found');

      // 3. Credit winner balance using ledger
      await walletRepository.updateBalanceWithLedger(
        winnerId,
        battle.winnerAmount,
        'WINNING',
        `Battle Victory (Auto-Settled): ${battle.title}`,
        undefined,
        tx
      );

      // 4. Process referrer commission reward (0.5% winning commission)
      await referralService.processWinningCommission(winnerId, battle.winnerAmount, battle.id, tx);

      // 5. Create transaction log
      await tx.transaction.create({
        data: {
          userId: winnerId,
          walletId: wallet.id,
          amount: battle.winnerAmount,
          type: 'BATTLE_WIN',
          status: 'SUCCESS',
          referenceId: battle.id,
          description: `Won Battle (AI Auto-Settled): "${battle.title}"`,
        }
      });

      // 6. Record Platform Revenue
      const totalVolume = battle.amount * 2;
      const commissionEarned = totalVolume - battle.winnerAmount;
      await tx.platformRevenue.create({
        data: {
          battleId: battle.id,
          commissionEarned,
          totalBattleVolume: totalVolume,
        }
      });

      // 7. Send notifications
      await notificationService.sendNotification(
        winnerId,
        'Battle Settled (Winner)!',
        `Your battle "${battle.title}" was verified by AI. You won ₹${battle.winnerAmount}!`,
        'BATTLE',
        battle.id
      );

      await notificationService.sendNotification(
        loserId,
        'Battle Settled (Loss)',
        `Your battle "${battle.title}" was verified by AI. Outcome: LOSS.`,
        'BATTLE',
        battle.id
      );
    });

    // Fetch the updated battle with relations to emit
    const updated = await prisma.battle.findUnique({
      where: { id: battle.id },
      include: {
        creator: { select: { id: true, name: true, email: true, avatar: true } },
        joiner: { select: { id: true, name: true, email: true, avatar: true } },
        participants: true,
      }
    });

    emitBattleUpdate(battle.id, 'battle_settled', updated);
  }

  /**
   * Mark the battle status as DISPUTED and record the reason
   */
  private async markAsDisputed(
    battleId: string,
    disputeReason: string,
    confidence: number,
    aiResponse: any
  ): Promise<void> {
    const updated = await prisma.battle.update({
      where: { id: battleId },
      data: {
        status: 'DISPUTED',
        aiConfidence: confidence,
        aiResponse: aiResponse ? (aiResponse as any) : undefined,
        verificationStatus: 'DISPUTED',
        verificationTimestamp: new Date(),
        adminNotes: disputeReason
      },
      include: {
        creator: { select: { id: true, name: true, email: true, avatar: true } },
        joiner: { select: { id: true, name: true, email: true, avatar: true } },
        participants: true,
      }
    });

    // Notify both players
    await notificationService.sendNotification(
      updated.createdBy,
      'Battle Disputed',
      `Your battle "${updated.title}" is disputed and requires admin review. Reason: ${disputeReason}`,
      'BATTLE',
      battleId
    );

    if (updated.joinedBy) {
      await notificationService.sendNotification(
        updated.joinedBy,
        'Battle Disputed',
        `Your battle "${updated.title}" is disputed and requires admin review. Reason: ${disputeReason}`,
        'BATTLE',
        battleId
      );
    }

    emitBattleUpdate(battleId, 'battle_disputed', updated);
  }
}

export const aiVerificationService = new AIVerificationService();
export default aiVerificationService;
