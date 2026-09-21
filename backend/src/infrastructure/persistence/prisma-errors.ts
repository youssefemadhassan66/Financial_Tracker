import { Prisma } from '@prisma/client';

/**
 * True when a write failed because a UNIQUE constraint rejected it
 * (Postgres error 23505, surfaced by Prisma as P2002).
 *
 * Repositories translate this into application meaning — "email taken",
 * "SMS already stored" — so no layer above infrastructure ever has to
 * know Prisma error codes exist.
 */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
