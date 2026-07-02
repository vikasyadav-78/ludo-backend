import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import apiRouter from './routes';
import { setupSwagger } from './config/swagger';
import { globalErrorHandler } from './middlewares/errorHandler';
import { apiLimiter } from './middlewares/rateLimiter';
import AppError from './utils/AppError';

import path from 'path';

const app: Express = express();

// Trust proxy for rate limiters when deployed behind a proxy (like Railway)
app.set('trust proxy', 1);

// Security HTTP headers - allow cross-origin resource sharing for local images
app.use(helmet({ crossOriginResourcePolicy: false }));

// Enable CORS
app.use(cors());

// Limit API requests
app.use('/api', apiLimiter);

// Body parser
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Serve uploaded assets statically
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Swagger Documentation API
setupSwagger(app);

// Mount main API router
app.use('/api/v1', apiRouter);

// Health Check Endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Fallback for undefined routes
app.all('*', (req: Request, res: Response, next: NextFunction) => {
  if (req.originalUrl.startsWith('/uploads/')) {
    return res.status(404).json({
      status: 'fail',
      message: `File not found: ${req.originalUrl}`
    });
  }
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// Centralized error handler middleware
app.use(globalErrorHandler);

export default app;
