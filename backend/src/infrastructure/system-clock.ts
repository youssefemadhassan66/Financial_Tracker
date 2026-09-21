import type { Clock } from '../application/ports/clock.js';

export const systemClock: Clock = {
  now: () => new Date(),
};
