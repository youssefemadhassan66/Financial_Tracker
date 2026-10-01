import { describe, expect, it } from 'vitest';
import { addedIds } from './new-rows';

describe('addedIds', () => {
  it('returns only rows that were not there before', () => {
    const before = new Set(['a', 'b']);
    expect([...addedIds(before, [{ id: 'c' }, { id: 'a' }, { id: 'd' }, { id: 'b' }])]).toEqual(['c', 'd']);
  });

  it('returns nothing when nothing changed', () => {
    expect(addedIds(new Set(['a']), [{ id: 'a' }]).size).toBe(0);
  });
});
