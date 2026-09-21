import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 moved the database URL OUT of schema.prisma.
 *
 * The schema file is committed and describes structure only; the
 * connection string is environment-specific and secret. Keeping them
 * apart means the schema can no longer accidentally carry a credential,
 * and it is why `datasource { url = env(...) }` is now rejected.
 *
 * This config is used by the CLI (migrate, generate, studio). The
 * runtime client connects separately through a driver adapter — see
 * src/infrastructure/persistence/prisma-client.ts.
 */

const databaseUrl = process.env['DATABASE_URL'];

if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  // Fail here with a message that says what to do, rather than letting
  // the CLI report a vaguer connection error further down.
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: databaseUrl,
  },
});
