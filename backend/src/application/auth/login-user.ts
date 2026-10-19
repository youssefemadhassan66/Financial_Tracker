import { randomUUID } from 'node:crypto';
import { User } from '../../domain/user.js';
import { AuthenticationError } from '../errors.js';
import type { UserRepository } from '../ports/repositories.js';
import type { PasswordHasher } from '../ports/security.js';
import type { SessionContext, SessionIssuer } from './session-issuer.js';
import type { AuthResult } from './register-user.js';
import { toUserDto } from './user-dto.js';

export interface LoginUserInput {
  email: string;
  password: string;
}

/**
 * One message for every failure. "No account with that email" versus
 * "wrong password" would let anyone test which emails are registered —
 * useful to an attacker building a target list.
 */
const INVALID_CREDENTIALS = 'Invalid email or password';

export class LoginUser {
  /** A real hash, computed once, verified against when the email is unknown. */
  private dummyHash: Promise<string> | undefined;

  constructor(
    private readonly users: UserRepository,
    private readonly passwords: PasswordHasher,
    private readonly sessions: SessionIssuer,
  ) {}

  async execute(input: LoginUserInput, context: SessionContext): Promise<AuthResult> {
    const user = await this.users.findByEmail(User.normalizeEmail(input.email));

    if (user === null) {
      // Timing defence. argon2 deliberately takes tens of milliseconds.
      // If an unknown email returned instantly while a known one took
      // 50ms, the identical error message above would be pointless — the
      // response TIME would reveal which emails exist. So do the same
      // expensive work either way.
      await this.passwords.verify(await this.getDummyHash(), input.password);
      throw new AuthenticationError(INVALID_CREDENTIALS);
    }

    const valid = await this.passwords.verify(user.getPasswordHash(), input.password);
    if (!valid) {
      throw new AuthenticationError(INVALID_CREDENTIALS);
    }

    // A new login starts a new token family.
    const tokens = await this.sessions.issue(user.id, randomUUID(), context);
    return { user: toUserDto(user), tokens };
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.passwords.hash('timing-equalisation-password');
    return this.dummyHash;
  }
}
