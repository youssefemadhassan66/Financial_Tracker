import { z } from 'zod';
import {
  currencyField,
  emailField,
  newPasswordField,
  passwordInputField,
  safeText,
} from './fields.js';

/**
 * Request body schemas.
 *
 * Every object is STRICT: an unknown key is a 400, not silently dropped.
 * This blocks mass assignment — a client sending `{ "userId": "…" }` or
 * `{ "role": "admin" }` hoping the server copies it into a database row.
 * Rejecting rather than stripping also tells an honest client immediately
 * that it misspelled a field, instead of the field quietly vanishing.
 */

export const registerBody = z.strictObject({
  email: emailField,
  password: newPasswordField,
  defaultCurrency: currencyField.default('EGP'),
});

export const loginBody = z.strictObject({
  email: emailField,
  password: passwordInputField,
});

export const createDeviceKeyBody = z.strictObject({
  name: safeText({ max: 64 }),
});

/**
 * An SMS as forwarded by MacroDroid.
 *
 * `body` is multiline (bank SMS often contain line breaks) and may be
 * Arabic. 2000 characters comfortably fits the longest concatenated SMS.
 */
export const ingestSmsBody = z.strictObject({
  sender: safeText({ max: 64 }),
  body: safeText({ max: 2000, multiline: true }),
  receivedAt: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
});
