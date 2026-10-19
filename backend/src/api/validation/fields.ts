import { z } from 'zod';

/**
 * Reusable, sanitizing field schemas. Every request body is built from
 * these, so each rule is written once and applied everywhere.
 *
 * A note on what "sanitize" means here, because it is widely misread:
 *
 * We VALIDATE and NORMALIZE on the way in. We do NOT HTML-escape input.
 * Escaping belongs on OUTPUT, in the context it is rendered into (React
 * already escapes text by default). Escaping on input corrupts real
 * data: a merchant called "M&S" would be stored as "M&amp;S", and would
 * then be double-escaped on display. Store what the user meant; encode
 * it when you show it.
 *
 * SQL injection is likewise not handled by mangling strings. Prisma
 * sends every value as a bound parameter, never spliced into SQL text.
 * The one way to reintroduce it is $queryRawUnsafe with string
 * concatenation — which this codebase does not use.
 */

/**
 * Control characters that must never appear in stored text.
 *
 * U+0000 (NUL) is the important one: Postgres TEXT columns reject it
 * outright, so an unchecked NUL in a request becomes a 500 at insert
 * time. The rest are invisible characters with no legitimate place in a
 * name or an email, and are handy for spoofing ("admin\u0008x").
 * Tab, LF and CR are excluded from this set — multi-line text needs them.
 */
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

/**
 * Bidirectional-override characters (U+202A–U+202E, U+2066–U+2069).
 * These can make text DISPLAY in a different order than it is stored —
 * the "Trojan Source" attack. Arabic and English mixed together render
 * correctly without them; the Unicode bidi algorithm handles that on its
 * own. So they are refused rather than stripped: silently changing input
 * is worse than rejecting it with a clear message.
 */
const BIDI_OVERRIDES = /[\u202A-\u202E\u2066-\u2069]/;

interface TextOptions {
  min?: number;
  max: number;
  /** Allow line breaks. Needed for SMS bodies, not for names. */
  multiline?: boolean;
}

/**
 * Safe free text. Unicode-normalized (NFC), trimmed, length-limited,
 * free of control and bidi-override characters. Arabic passes untouched.
 *
 * Why NFC: "é" can be stored as one code point or as "e" plus a combining
 * accent. They look identical but compare as different strings, so two
 * "identical" category names could both be created. NFC picks one form.
 */
export function safeText({ min = 1, max, multiline = false }: TextOptions) {
  return z
    .string()
    .transform((value) => value.normalize('NFC').trim())
    .pipe(
      z
        .string()
        .min(min, `Must be at least ${min} character${min === 1 ? '' : 's'}`)
        .max(max, `Must be at most ${max} characters`)
        .refine((value) => !FORBIDDEN_CONTROL_CHARS.test(value), 'Contains forbidden control characters')
        .refine((value) => !BIDI_OVERRIDES.test(value), 'Contains bidirectional override characters')
        .refine((value) => multiline || !/[\r\n]/.test(value), 'Must be a single line'),
    );
}

/** Trimmed, lowercased, RFC-length-limited email. */
export const emailField = z
  .string()
  .transform((value) => value.normalize('NFC').trim().toLowerCase())
  .pipe(
    z
      .string()
      .max(254, 'Email must be at most 254 characters')
      .refine((value) => !FORBIDDEN_CONTROL_CHARS.test(value), 'Contains forbidden control characters')
      .pipe(z.email('Invalid email address')),
  );

/**
 * A password as TYPED — used for login, where no policy applies (the
 * account may predate the current rules).
 *
 * Deliberately NOT trimmed: a password ending in a space is a different
 * password, and silently trimming it would lock that user out. It IS
 * NFC-normalized, per NIST SP 800-63B, so the same password typed on two
 * keyboards that compose accented letters differently still matches.
 *
 * The 128-character cap is a denial-of-service guard: argon2 cost grows
 * with input, and nobody's real password is longer.
 */
export const passwordInputField = z
  .string()
  .max(128, 'Password must be at most 128 characters')
  .refine((value) => !value.includes('\u0000'), 'Contains forbidden control characters')
  .transform((value) => value.normalize('NFC'))
  .pipe(z.string().min(1, 'Password is required'));

/**
 * The policy for NEW passwords (registration, password change).
 *
 * Length is the only rule. NIST no longer recommends composition rules
 * ("one symbol, one digit"): they push people to predictable patterns
 * like "Password1!" without adding real strength. Length does.
 *
 * NIST SP 800-63B rev 4 asks for 15 when a password is the ONLY factor,
 * which it is here until 2FA exists. 12 is a deliberate usability
 * trade-off for a personal app — raise this constant to 15 for stricter.
 */
export const MIN_PASSWORD_LENGTH = 12;

export const newPasswordField = passwordInputField.pipe(
  z.string().min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`),
);

export const uuidParam = z.uuid('Must be a valid id');

export const currencyField = z.enum(['EGP', 'USD']);

/**
 * Money as a DECIMAL STRING: "450.75", never the JSON number 450.75.
 *
 * JSON numbers are parsed into IEEE-754 floats before any code sees them,
 * so 0.1 arrives as 0.1000000000000000055511151231257827. By the time
 * decimal.js could help, precision is already gone. A string reaches the
 * server exactly as typed. Positive, at most 2 decimal places.
 */
export const moneyAmountField = z
  .string()
  .regex(/^(0|[1-9]\d{0,15})(\.\d{1,2})?$/, 'Amount must be a decimal string like "450.75"')
  .refine((value) => !/^0(\.0{1,2})?$/.test(value), 'Amount must be greater than zero');

/** An instant WITH its timezone offset. A bare "10:00" is ambiguous in
 *  Egypt, where DST moves the clock by an hour. */
export const instantField = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value));
