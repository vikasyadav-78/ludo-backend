import { PrismaClient } from '@prisma/client';
import { logger } from '../config/logger';

export const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'event', level: 'error' },
    { emit: 'event', level: 'info' },
    { emit: 'event', level: 'warn' },
  ],
});

// Log prisma query and warnings to winston logger
prisma.$on('query', (e) => {
  logger.debug(`Prisma Query: ${e.query} | Params: ${e.params} | Duration: ${e.duration}ms`);
});

prisma.$on('error', (e) => {
  logger.error(`Prisma Error: ${e.message}`);
});

prisma.$on('info', (e) => {
  logger.info(`Prisma Info: ${e.message}`);
});

prisma.$on('warn', (e) => {
  logger.warn(`Prisma Warning: ${e.message}`);
});

export const connectDB = async (): Promise<void> => {
  try {
    await prisma.$connect();
    logger.info('MySQL Connected successfully via Prisma.');
  } catch (error: any) {
    logger.error(`MySQL connection error: ${error.message}`);
    process.exit(1);
  }
};

export const disconnectDB = async (): Promise<void> => {
  try {
    await prisma.$disconnect();
    logger.info('MySQL disconnected.');
  } catch (error: any) {
    logger.error(`MySQL disconnection error: ${error.message}`);
  }
};

export default prisma;
