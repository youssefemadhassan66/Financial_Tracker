/**
 * The currencies this app understands. A closed union instead of `string`
 * means TypeScript rejects `"EGB"` (typo) at compile time instead of it
 * silently reaching the database.
 *
 * Egyptian banks are the primary source, so EGP is first. USD is included
 * because some accounts (Instapay, foreign cards) do carry it.
 */
export type Currency = 'EGP' | 'USD';

export const CURRENCIES: readonly Currency[] = ['EGP', 'USD'];

export function isCurrency(value: string): value is Currency {
  return (CURRENCIES as readonly string[]).includes(value);
}
