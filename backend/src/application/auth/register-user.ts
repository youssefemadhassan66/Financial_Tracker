import { randomUUID } from 'node:crypto';
import { User } from '../../domain/user.js';
import { newUserId } from '../../domain/ids.js';
import type { Currency } from '../../domain/currency.js';
import { DEFAULT_CATEGORIES } from '../../domain/default-categories.js';
import { ConflictError } from '../errors.js';
import type { UserRepository } from '../ports/repositories.js';
import type { PasswordHasher } from '../ports/security.js';
import type { SessionContext, SessionIssuer, SessionTokens } from './session-issuer.js';
import { toUserDto, type UserDto } from './user-dto.js';

export interface RegisterUserInput {
  email: string;
  /** Already validated against the password policy by the API layer. */
  password: string;
  defaultCurrency: Currency;
}

export interface AuthResult {
  user: UserDto;
  tokens: SessionTokens;
}

export class RegisterUser {
  constructor(
    private readonly users: UserRepository,
    private readonly passwords: PasswordHasher,
    private readonly sessions: SessionIssuer,
  ) {}

  async execute(input: RegisterUserInput, context: SessionContext): Promise<AuthResult> {
    const email = User.normalizeEmail(input.email);

    // Fast, friendly path. NOT the real guarantee — two requests can both
    // pass this check at the same instant. The unique index on
    // users.email is the real guarantee, and the repository turns that
    // violation into the same ConflictError.
    if ((await this.users.findByEmail(email)) !== null) {
      throw new ConflictError('An account with this email already exists');
    }

    // The plaintext password stops here. From this line on only the hash
    // exists, and the Domain never sees the plaintext at all.
    const passwordHash = await this.passwords.hash(input.password);

    const user = User.create({
      id: newUserId(randomUUID()),
      email,
      passwordHash,
      defaultCurrency: input.defaultCurrency,
    });

    await this.users.create(
      user,
      DEFAULT_CATEGORIES.map((c) => ({ name: c.name, kind: c.kind, icon: c.icon, color: null, isSystem: true })),
    );

    const tokens = await this.sessions.issue(user.id, randomUUID(), context);
    return { user: toUserDto(user), tokens };
  }
}
