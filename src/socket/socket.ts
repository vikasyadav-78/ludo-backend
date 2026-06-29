import { Server as HTTPServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { logger } from '../config/logger';

let io: Server | null = null;

interface SocketUserPayload {
  userId: string;
  role: string;
}

export const initSocket = (server: HTTPServer): Server => {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  // Simple authentication handshake
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Authentication error: Token required'));
    }

    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as SocketUserPayload;
      socket.data = { userId: decoded.userId, role: decoded.role };
      next();
    } catch (err) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const { userId, role } = socket.data;
    logger.info(`Socket connected: ${socket.id} (User: ${userId}, Role: ${role})`);

    // Join personal user room
    socket.join(`user:${userId}`);

    // Join role room if admin
    if (role === 'ADMIN') {
      socket.join('admin:lobby');
    }

    socket.on('join_battle', (battleId: string) => {
      socket.join(`battle:${battleId}`);
      logger.info(`Socket ${socket.id} joined battle room: ${battleId}`);
    });

    socket.on('leave_battle', (battleId: string) => {
      socket.leave(`battle:${battleId}`);
      logger.info(`Socket ${socket.id} left battle room: ${battleId}`);
    });

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
};

export const getIO = (): Server => {
  if (!io) {
    throw new Error('Socket.io is not initialized!');
  }
  return io;
};

// Emit real-time helper for battles
export const emitBattleUpdate = (battleId: string, event: string, data: any) => {
  try {
    const ioInstance = getIO();
    ioInstance.to(`battle:${battleId}`).emit(event, data);
    ioInstance.emit('battle_list_update', { battleId, event, data });
  } catch (error: any) {
    logger.warn(`Could not emit battle update: ${error.message}`);
  }
};

// Emit real-time helper for private user notifications
export const emitUserNotification = (userId: string, data: any) => {
  try {
    const ioInstance = getIO();
    ioInstance.to(`user:${userId}`).emit('notification', data);
  } catch (error: any) {
    logger.warn(`Could not emit notification: ${error.message}`);
  }
};

// Expose online clients count
export const getOnlineUsersCount = (): number => {
  return io?.sockets.sockets.size || 0;
};

// Emit live events to admin lobby
export const emitAdminEvent = (event: string, data: any) => {
  try {
    const ioInstance = getIO();
    ioInstance.to('admin:lobby').emit(event, data);
  } catch (error: any) {
    logger.warn(`Could not emit admin event: ${error.message}`);
  }
};

// Emit real-time configuration updates to all connected players
export const emitSettingsUpdate = (settings: Record<string, string>) => {
  try {
    const ioInstance = getIO();
    ioInstance.emit('settings_update', settings);
  } catch (error: any) {
    logger.warn(`Could not emit settings update: ${error.message}`);
  }
};
