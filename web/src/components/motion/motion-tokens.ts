/**
 * Shared motion tokens: durations, easings, and stagger configuration.
 */

export const EASE_OUT_QUART = [0.25, 1, 0.5, 1] as const;
export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

export const DURATION_FEEDBACK = 0.2; // 200ms for UI feedback (hover, press, selection, panels)
export const DURATION_PANEL = 0.25; // 250ms for panel and page entrance transitions
export const DURATION_COUNT_UP = 0.7; // 700ms for number count-ups
export const DURATION_BAR = 0.7; // 700ms for category bars growing
export const DURATION_HIGHLIGHT = 1.2; // ~1.2s for newly added row highlight fading out

export const STAGGER_DELAY = 0.04; // 40ms per item
export const STAGGER_MAX_INDEX = 7; // Capped after the 8th item (index 7)
export const STAGGER_MAX_ROWS = 10; // Only stagger the first 10 rows of a list render
