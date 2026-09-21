import type { SmsCatalog, SmsIgnoreRule, SmsTemplate } from '../sms-template.js';

/**
 * One-time passwords and verification codes. They often quote an amount
 * and a merchant ("code for EGP 500 at AMAZON"), so without this rule
 * they would parse as purchases that never happened.
 */
const ONE_TIME_CODES: SmsIgnoreRule = {
  id: 'common.otp.v1',
  pattern: /\b(?:OTP|one[- ]time (?:password|code)|verification code|activation code)\b|كود التحقق|رمز التحقق|كلمة السر المؤقتة|كلمة المرور لمرة واحدة/i,
};

/**
 * Bank formats, most specific first within each bank.
 *
 * Empty until the per-bank templates land (CIB, NBE, Banque Misr). Until
 * then every SMS is stored and marked ignored (unknown sender). Nothing
 * is lost: `POST /api/sms/reprocess` re-reads every message that is not
 * yet a transaction, so they parse once the templates exist.
 */
const TEMPLATES: readonly SmsTemplate[] = [];

export const BANK_CATALOG: SmsCatalog = {
  templates: TEMPLATES,
  ignoreRules: [ONE_TIME_CODES],
};
