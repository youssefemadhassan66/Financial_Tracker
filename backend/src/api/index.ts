import 'dotenv/config';
import { loadConfig } from './config/env.js';
import { buildContainer } from './container.js';
import { createServer } from './server.js';
import { disconnectPrisma } from '../infrastructure/persistence/prisma-client.js';

// Validate configuration first: a bad secret stops the process here,
// before a single request is accepted.
const config = loadConfig();
const app = createServer(buildContainer(config), config);

const server = app.listen(config.port, () => {
  console.warn(`API listening on http://localhost:${config.port} (${config.nodeEnv})`);
});

/**
 * Graceful shutdown: stop accepting connections, let in-flight requests
 * finish, then close the database pool. Killing the process mid-request
 * could leave a refresh token half-rotated.
 */
function shutdown(signal: string): void {
  console.warn(`${signal} received, shutting down`);
  server.close(() => {
    void disconnectPrisma().finally(() => process.exit(0));
  });
  // Don't hang forever on a stuck connection.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
