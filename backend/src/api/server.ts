import express, { type Express, type Request, type Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import type { AppConfig } from './config/env.js';
import type { Container } from './container.js';
import { createRateLimiters } from './middleware/rate-limits.js';
import { rejectDangerousKeys } from './middleware/reject-dangerous-keys.js';
import { errorHandler, notFound } from './middleware/error-handler.js';
import { authRouter } from './routes/auth.routes.js';
import { devicesRouter, ingestRouter } from './routes/devices.routes.js';
import { financeRouter } from './routes/finance.routes.js';
import { smsRouter } from './routes/sms.routes.js';

/**
 * Builds the Express application. Kept separate from index.ts so tests
 * can build an app without binding a real port.
 *
 * MIDDLEWARE ORDER IS A SECURITY DECISION. Read top to bottom:
 * headers are hardened before anything else runs; the body size is
 * capped before it is parsed; dangerous keys are rejected before any
 * route sees the body; the error handler is last so it catches all.
 */
export function createServer(container: Container, config: AppConfig): Express {
  const app = express();
  const limits = createRateLimiters(config.rateLimits);

  // Behind a reverse proxy, req.ip is the PROXY's address unless we say
  // how many proxies to trust. Rate limiting would then throttle every
  // user together as one IP. Default 0: trust nothing.
  app.set('trust proxy', config.trustProxy);

  // Secure headers: nosniff, frame denial, HSTS, a strict CSP, and it
  // removes X-Powered-By so the response doesn't advertise "Express".
  app.use(helmet());

  // CORS is NOT authentication. It only tells BROWSERS which sites'
  // JavaScript may read our responses. curl and MacroDroid ignore it
  // entirely — that is fine, they authenticate by token instead.
  app.use(cors({ origin: config.corsOrigins, credentials: true }));

  // Cap the body BEFORE parsing it. A 1 GB JSON body would otherwise be
  // read into memory in full before anything could reject it.
  app.use(express.json({ limit: '64kb' }));
  app.use(cookieParser());
  app.use(rejectDangerousKeys);
  app.use(limits.global);

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.use('/api/auth', authRouter(container, config, limits));
  app.use('/api/devices', devicesRouter(container));
  app.use('/api/ingest', ingestRouter(container, limits));
  app.use('/api/sms', smsRouter(container));
  app.use('/api', financeRouter(container));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
