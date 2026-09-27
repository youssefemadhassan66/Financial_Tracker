export const MAX_CARD_DIGIT_ENTRIES = 10;

/**
 * Digits still sitting in the input when the form is submitted. People type
 * "1111" and press Save without pressing "Add"; silently dropping them would
 * save an account that never receives SMS. So a complete entry is included,
 * and a half-typed one blocks the save with a message instead.
 */
export function withPendingDigits(
  list: readonly string[],
  pendingInput: string,
  max: number = MAX_CARD_DIGIT_ENTRIES,
): { ok: true; digits: string[] } | { ok: false; error: string } {
  const pending = pendingInput.trim();
  if (pending === '' || list.includes(pending)) return { ok: true, digits: [...list] };
  if (!/^\d{4}$/.test(pending)) {
    return { ok: false, error: 'Finish the 4 digits you started typing, or clear them.' };
  }
  if (list.length >= max) {
    return { ok: false, error: `You can add up to ${max} numbers.` };
  }
  return { ok: true, digits: [...list, pending] };
}
