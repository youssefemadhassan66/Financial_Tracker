import type { PrismaClient, User as UserRow } from '@prisma/client';
import { User } from '../../domain/user.js';
import { newUserId, type UserId } from '../../domain/ids.js';
import { ConflictError } from '../../application/errors.js';
import type { UserRepository } from '../../application/ports/repositories.js';
import type { NewCategory } from '../../application/ports/finance.js';
import { isUniqueViolation } from './prisma-errors.js';

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(normalizedEmail: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    return row === null ? null : toDomain(row);
  }

  async findById(id: UserId): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row === null ? null : toDomain(row);
  }

  async create(user: User, initialCategories: readonly NewCategory[]): Promise<void> {
    try {
      await this.prisma.user.create({
        data: {
          id: user.id,
          email: user.email,
          passwordHash: user.getPasswordHash(),
          defaultCurrency: user.getDefaultCurrency(),
          // Settings and starter categories are created in the SAME
          // statement, so a user can never exist half set up.
          settings: { create: {} },
          categories: { create: initialCategories.map((c) => ({ ...c })) },
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        // Two registrations raced past RegisterUser's pre-check. The
        // database's unique index caught the loser — translate it into
        // the same answer the pre-check would have given.
        throw new ConflictError('An account with this email already exists');
      }
      throw error;
    }
  }
}

/** Rows are rebuilt through User.create, so a row that violates a domain
 *  rule fails loudly on load instead of flowing on into the app. */
function toDomain(row: UserRow): User {
  return User.create({
    id: newUserId(row.id),
    email: row.email,
    passwordHash: row.passwordHash,
    defaultCurrency: row.defaultCurrency,
  });
}
