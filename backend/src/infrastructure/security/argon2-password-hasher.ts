import argon2 from 'argon2';
import type { PasswordHasher } from '../../application/ports/security.js';

/**
 * argon2id with the OWASP Password Storage Cheat Sheet minimum:
 * 19 MiB of memory, 2 iterations, 1 degree of parallelism.
 *
 * Memory cost is the part that matters. It is what makes GPU and ASIC
 * cracking expensive — an attacker's hardware has lots of cores but not
 * lots of memory per core. Raising it later is safe: argon2 embeds its
 * parameters in every hash, so old hashes keep verifying.
 */
const OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export class Argon2PasswordHasher implements PasswordHasher {
  hash(plainPassword: string): Promise<string> {
    return argon2.hash(plainPassword, OPTIONS);
  }

  async verify(passwordHash: string, plainPassword: string): Promise<boolean> {
    try {
      return await argon2.verify(passwordHash, plainPassword);
    } catch {
      // argon2.verify THROWS on a malformed hash rather than returning
      // false (confirmed by probing it). Left uncaught, one corrupted row
      // would turn a login attempt into a 500. The port's contract is
      // "false for anything that isn't a match", so honour it here.
      return false;
    }
  }
}
