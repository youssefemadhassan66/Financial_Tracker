/**
 * The Masroof mark on a 24-unit grid: a message bubble holding a coin
 * (your bank's SMS becomes money). One source of truth for the in-app logo
 * and the generated icons; the Android adaptive icon copies these paths.
 */
export const MARK_BUBBLE =
  'M6.5 4h11A3.5 3.5 0 0 1 21 7.5v7a3.5 3.5 0 0 1-3.5 3.5H12l-4.5 3.5V18h-1A3.5 3.5 0 0 1 3 14.5v-7A3.5 3.5 0 0 1 6.5 4z';
export const MARK_COIN = { cx: 12, cy: 11, r: 3 } as const;
export const MARK_STROKE = 2.2;
