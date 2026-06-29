import prisma from '../database/db';
import { emitUserNotification } from '../socket/socket';
import { logger } from '../config/logger';

export class NotificationService {
  async sendNotification(
    userId: string,
    title: string,
    body: string,
    type: 'BATTLE' | 'WALLET' | 'SYSTEM',
    battleId?: string
  ): Promise<void> {
    try {
      const finalBody = (type === 'BATTLE' && battleId) ? `${body}|battleId:${battleId}` : body;
      const notif = await prisma.notification.create({
        data: {
          userId,
          title,
          body: finalBody,
          type,
        },
      });

      // Emit through WebSockets for real-time app update
      emitUserNotification(userId, {
        id: notif.id,
        title,
        body: finalBody,
        type,
        readStatus: false,
        createdAt: notif.createdAt,
      });

      logger.info(`Push notification sent to user:${userId} | Title: "${title}"`);
    } catch (err: any) {
      logger.error(`Error sending notification: ${err.message}`);
    }
  }

  async getMyNotifications(userId: string) {
    return prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markAsRead(notificationId: string, userId: string) {
    return prisma.notification.update({
      where: { id: notificationId, userId },
      data: { readStatus: true },
    });
  }

  async markAllAsRead(userId: string) {
    return prisma.notification.updateMany({
      where: { userId },
      data: { readStatus: true },
    });
  }
}

export const notificationService = new NotificationService();
export default notificationService;
