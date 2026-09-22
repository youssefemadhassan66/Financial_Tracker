import type { SmsCatalog, SmsIgnoreRule, SmsTemplate } from '../sms-template.js';
import { CIB_IGNORE_RULES, CIB_TEMPLATES } from './cib.js';

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
 * Only CIB is supported (the only bank in use). Messages that arrived
 * before a template existed are not lost: `POST /api/sms/reprocess`
 * re-reads every message that is not yet a transaction.
 */
const TEMPLATES: readonly SmsTemplate[] = [
  ...CIB_TEMPLATES,
];

export const BANK_CATALOG: SmsCatalog = {
  templates: TEMPLATES,
  ignoreRules: [ONE_TIME_CODES, ...CIB_IGNORE_RULES],
};
