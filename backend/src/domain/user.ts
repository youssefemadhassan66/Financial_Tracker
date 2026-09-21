import { DomainError } from './errors.js';
import type { Currency } from './currency.js';
import type { UserId } from './ids.js';

export interface CreateUserInput {
  id: UserId;
  email: string;
  /**
   * The ALREADY-HASHED password (argon2id). Hashing is a cryptographic
   * concern, so it lives in Infrastructure — the Domain never sees, and
   * must never be handed, a plaintext password. Accepting a plaintext
   * here would make it far too easy for one to end up in a log line or
   * an error message.
   */
  passwordHash: string;
  /** Currency new accounts default to. EGP for this user. */
  defaultCurrency: Currency;
}

/**
 * A User is an ENTITY, and it is also the tenancy boundary: every
 * account, transaction and category in the system belongs to exactly one
 * user, and no query may ever cross that line.
 *
 * The app has one real user today. The UserId still threads through
 * everything from the start, because adding a user_id column to tables
 * that already hold thousands of rows — and then backfilling it, and
 * auditing every existing query for the missing filter — is a genuinely
 * painful migration. The column costs nothing now.
 */
export class User {
  readonly id: UserId;
  readonly email: string;

  private passwordHash: string;
  private defaultCurrency: Currency;

  private constructor(input: CreateUserInput, email: string) {
    this.id = input.id;
    this.email = email;
    this.passwordHash = input.passwordHash;
    this.defaultCurrency = input.defaultCurrency;
  }

  static create(input: CreateUserInput): User {
    const email = User.normalizeEmail(input.email);

    if (!User.isValidEmail(email)) {
      throw new DomainError('User email is not valid');
    }
    if (input.passwordHash.trim().length === 0) {
      throw new DomainError('User passwordHash cannot be empty');
    }
    // A bare password would be well under this; a real argon2id or bcrypt
    // digest is far longer. This is a tripwire against accidentally
    // passing plaintext into the field, not a security control.
    if (input.passwordHash.length < 20) {
      throw new DomainError('User passwordHash looks unhashed');
    }

    return new User(input, email);
  }

  /** Lowercased and trimmed so "Youssef@Example.com " and
   *  "youssef@example.com" cannot become two different accounts. */
  static normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private static isValidEmail(email: string): boolean {
    // Deliberately permissive. Full RFC 5322 validation by regex is a
    // well-known trap, and the only real proof an address works is
    // sending mail to it. This just rejects obvious nonsense.
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
  }

  changePasswordHash(passwordHash: string): void {
    if (passwordHash.length < 20) {
      throw new DomainError('User passwordHash looks unhashed');
    }
    this.passwordHash = passwordHash;
  }

  /** Only Infrastructure should call this, to compare against a login
   *  attempt. It is never serialized to an API response. */
  getPasswordHash(): string {
    return this.passwordHash;
  }

  getDefaultCurrency(): Currency {
    return this.defaultCurrency;
  }

  setDefaultCurrency(currency: Currency): void {
    this.defaultCurrency = currency;
  }

  /**
   * The tenancy check, in one place with a name.
   *
   * Every use case that loads a record must call this before returning
   * it. Scattering `if (row.userId !== currentUser.id)` through the
   * codebase is how one of them eventually gets forgotten, and a
   * forgotten one means a user reading someone else's bank transactions.
   */
  assertOwns(resourceOwnerId: UserId): void {
    if (this.id !== resourceOwnerId) {
      throw new DomainError('Resource does not belong to this user');
    }
  }
}
