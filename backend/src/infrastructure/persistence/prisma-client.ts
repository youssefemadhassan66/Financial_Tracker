import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/**
 * The Prisma client instance.
 *
 * Prisma 7 no longer reads the connection URL from schema.prisma — the
 * runtime client connects through a DRIVER ADAPTER, here node-postgres.
 * The schema stays a pure structural description with no credential in
 * it, and the URL comes from the environment at startup.
 *
 * Only src/infrastructure may import @prisma/client — ESLint's
 * no-restricted-imports enforces that. Everything above depends on the
 * repository interfaces declared in the Application layer, so swapping
 * Prisma for anything else would touch this directory and nothing else.
 */

function readDatabaseUrl(): string {
  const url = process.env['DATABASE_URL'];
  if (url === undefined || url.trim().length === 0) {
    // Fail loudly at startup rather than on the first query. A missing
    // DATABASE_URL is a deployment mistake, and it should stop the
    // process immediately instead of surfacing as a confusing error
    // during someone's first request.
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  }
  return url;
}

let client: PrismaClient | undefined;

/** Lazily created so importing this module never opens a connection —
 *  which matters for tests that should not need a live database. */
export function getPrismaClient(): PrismaClient {
  if (client === undefined) {
    const adapter = new PrismaPg({ connectionString: readDatabaseUrl() });
    client = new PrismaClient({
      adapter,
      log: process.env['NODE_ENV'] === 'development' ? ['warn', 'error'] : ['error'],
    });
  }
  return client;
}

export async function disconnectPrisma(): Promise<void> {
  if (client !== undefined) {
    await client.$disconnect();
    client = undefined;
  }
}
