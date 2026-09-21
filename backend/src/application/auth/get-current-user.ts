import type { UserId } from '../../domain/ids.js';
import { AuthenticationError } from '../errors.js';
import type { UserRepository } from '../ports/repositories.js';
import { toUserDto, type UserDto } from './user-dto.js';

export class GetCurrentUser {
  constructor(private readonly users: UserRepository) {}

  async execute(userId: UserId): Promise<UserDto> {
    const user = await this.users.findById(userId);
    if (user === null) {
      // A valid token for a user who no longer exists. Treat it as an
      // authentication failure, not a 404 — the token is what's wrong.
      throw new AuthenticationError('Account no longer exists');
    }
    return toUserDto(user);
  }
}
