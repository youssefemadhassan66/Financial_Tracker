import { describe, expect, it } from 'vitest';
import { staggerContainerVariants, staggerItemVariants } from './stagger';
import { STAGGER_DELAY, STAGGER_MAX_INDEX } from './motion-tokens';

type VisibleFn = (index?: number) => { transition: { delay?: number } };

describe('stagger variants', () => {
  const visible = staggerItemVariants.visible as unknown as VisibleFn;

  it('delays items by their index, capped after the 8th', () => {
    expect(visible(0).transition.delay).toBe(0);
    expect(visible(3).transition.delay).toBeCloseTo(3 * STAGGER_DELAY);
    expect(visible(STAGGER_MAX_INDEX).transition.delay).toBeCloseTo(STAGGER_MAX_INDEX * STAGGER_DELAY);
    expect(visible(40).transition.delay).toBeCloseTo(STAGGER_MAX_INDEX * STAGGER_DELAY);
  });

  it('container adds no delay of its own (it would stack on top of the item delay)', () => {
    expect(JSON.stringify(staggerContainerVariants)).not.toContain('staggerChildren');
    expect(JSON.stringify(staggerContainerVariants)).not.toContain('opacity');
  });
});
