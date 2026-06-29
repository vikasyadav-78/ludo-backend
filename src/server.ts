import http from 'http';
import app from './app';
import { connectDB, disconnectDB } from './database/db';
import { env } from './config/env';
import { logger } from './config/logger';
import { initSocket } from './socket/socket';

import { systemSettingsService } from './modules/system-settings/SystemSettingsService';

const server = http.createServer(app);

// Initialize Socket.io
initSocket(server);

const startServer = async () => {
  // Connect to Database
  await connectDB();

  // Initialize System Settings and Cache
  await systemSettingsService.initializeAndSeed();

  // Listen on PORT
  const PORT = env.PORT;
  server.listen(PORT, () => {
    logger.info(`🚀 Server running in ${env.NODE_ENV} mode on port ${PORT}`);
    logger.info(`📖 API documentation available at http://localhost:${PORT}/api-docs`);
  });
};

startServer();

// Handle graceful shutdown
const gracefulShutdown = async () => {
  logger.info('SIGTERM/SIGINT received. Shutting down gracefully...');
  server.close(async () => {
    logger.info('HTTP server closed.');
    await disconnectDB();
    logger.info('Database connection closed.');
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
