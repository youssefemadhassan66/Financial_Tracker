import express, { type Express, type Request, type Response } from 'express';

/**
 * Builds the Express application.
 *
 * This is the composition root: the one place allowed to know about every
 * layer and wire them together. Kept separate from index.ts so tests can
 * build an app without starting a listener on a real port.
 */
export function createServer(): Express {
  const app = express();

  app.use(express.json({ limit: '64kb' }));

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  return app;
}
