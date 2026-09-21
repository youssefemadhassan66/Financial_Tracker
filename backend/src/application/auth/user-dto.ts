import type { Currency } from '../../domain/currency.js';
import type { User } from '../../domain/user.js';

/**
 * What the outside world is allowed to see about a user.
 *
 * Never serialize the User entity itself. It holds the password hash,
 * and the day someone adds a field to User it would silently start
 * appearing in API responses. An explicit DTO means every exposed field
 * is a deliberate decision.
 */
export interface UserDto {
  id: string;
  email: string;
  defaultCurrency: Currency;
}

export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    defaultCurrency: user.getDefaultCurrency(),
  };
}
