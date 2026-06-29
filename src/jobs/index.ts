import prisma from '../database/db';
import { logger } from '../config/logger';

// Clean up old, open battles that have been abandoned (e.g. older than 24 hours)
export const cleanAbandonedBattles = async (): Promise<void> => {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = await prisma.battle.updateMany({
      where: {
        status: 'OPEN',
        createdAt: { lt: oneDayAgo },
      },
      data: {
        status: 'CANCELLED',
      },
    });
    logger.info(`Cron job: Cleaned up ${result.count} abandoned battles.`);
  } catch (error: any) {
    logger.error(`Cron job execution failed: ${error.message}`);
  }
};
