import type { SmsIgnoreRule, SmsTemplate } from '../sms-template.js';

// Preposition 'ب' in Arabic can appear with or without tatweel (U+0640): 'بـ' vs 'ب'.
// We use 'بـ?' in the regex patterns to cleanly accept both forms.
// Card/account numbers may have asterisks on either side or none: we use '\**(?<last4>\d{4})\**'.

export const CIB_TEMPLATES: readonly SmsTemplate[] = [
  // S1: Your credit card ending with#1111 was charged for EGP 3150.00 at TEST ONLINE SHO on 11/09/26 at 10:15. Card available limit is EGP 10000.00. For more details, please visit https://cib.eg/mb
  // S2: Your credit card #1111 was charged for USD 21.60 at TEST SOFTWARE PL on 07/09/26 at 11:40. Available limit is 10000.00 and the available international limit to use is EGP 50000
  {
    id: 'cib.card-purchase.en.v1',
    bank: 'CIB',
    senders: ['CIB'],
    event: 'purchase',
    // Matches English credit card charges with '#1111' or 'ending with#1111', optional stars, and lazy merchant anchored by 'on' and the date.
    pattern: /^Your credit card (?:ending with\s*)?#\s*\**(?<last4>\d{4})\**\s+was charged for\s+(?<currency>[A-Z]{3})\s+(?<amount>[\d,]+(?:\.\d{2})?)\s+at\s+(?<merchant>.+?)\s+on\s+\d{2}\/\d{2}\/\d{2}/,
  },

  // S3: تم خصم مبلغ EGP 5.00 من بطاقة الخصم المباشر المنتهية بـ **4444 عند Uber في 03/08/26 14:05 ، الرصيد المتاح EGP 1000.00
  {
    id: 'cib.debit-purchase.ar.v1',
    bank: 'CIB',
    senders: ['CIB'],
    event: 'purchase',
    // Matches Arabic debit card purchases with optional tatweel بـ?, spelling variants في/فى, and lazy merchant anchored by 'عند' and 'في/فى'.
    pattern: /^تم خصم مبلغ\s+(?<currency>[A-Z]{3})\s+(?<amount>[\d,]+(?:\.\d{2})?)\s+من بطاقة الخصم المباشر المنتهية بـ?\s*\**(?<last4>\d{4})\**\s+عند\s+(?<merchant>.+?)\s+ف[يى]\s+\d{2}\/\d{2}\/\d{2}/,
  },

  // S4: تم اضافة المعاملة من Uber بقيمة 5.00 EGP إلى بطاقتك المنتهية بـ **4444 . الرصيد المتاح EGP 1005.00
  {
    id: 'cib.debit-refund.ar.v1',
    bank: 'CIB',
    senders: ['CIB'],
    event: 'refund',
    // Matches Arabic debit card refund with currency after amount, spelling variants إضافة/اضافة and إلى/الى, and optional tatweel بـ?.
    pattern: /^تم [إا]ضافة المعاملة من\s+(?<merchant>.+?)\s+بقيمة\s+(?<amount>[\d,]+(?:\.\d{2})?)\s+(?<currency>[A-Z]{3})\s+[إا]لى بطاقتك المنتهية بـ?\s*\**(?<last4>\d{4})\**/,
  },

  // S5: تم سحب مبلغ EGP 1000.00 من بطاقة الخصم المباشر المنتهية بـ **4444 من TEST ATM101 في 09/08/26 13:40 ، الرصيد المتاح EGP 500.00
  {
    id: 'cib.atm-withdrawal.ar.v1',
    bank: 'CIB',
    senders: ['CIB'],
    event: 'withdrawal',
    // Matches Arabic ATM withdrawal with spelling variants في/فى, optional tatweel بـ?, and lazy ATM merchant anchored by second 'من' and 'في/فى'.
    pattern: /^تم سحب مبلغ\s+(?<currency>[A-Z]{3})\s+(?<amount>[\d,]+(?:\.\d{2})?)\s+من بطاقة الخصم المباشر المنتهية بـ?\s*\**(?<last4>\d{4})\**\s+من\s+(?<merchant>.+?)\s+ف[يى]\s+\d{2}\/\d{2}\/\d{2}/,
  },

  // S6: يرجى العلم انه تم تنفيذ تحويل لحظي بمبلغ 800.00 جم إلى TEST FRIEND NAME من حسابك المنتهي بـ ********2222 برقم مرجعي a1b2c3d4 بتاريخ 2026-09-11 14:16 للمزيد، برجاء الاتصال بـ 19666
  {
    id: 'cib.instant-transfer-named.ar.v1',
    bank: 'CIB',
    senders: ['CIB'],
    event: 'purchase',
    // Matches Arabic instant transfer to a named person with currency token 'جم' (mapped to EGP), spelling variants انه/إنه and إلى/الى, and optional tatweel بـ?.
    pattern: /^يرجى العلم [إا]نه تم تنفيذ تحويل لحظي بمبلغ\s+(?<amount>[\d,]+(?:\.\d{2})?)\s+(?<currency>جم|[A-Z]{3})\s+[إا]لى\s+(?<merchant>.+?)\s+من حسابك المنتهي بـ?\s*\**(?<last4>\d{4})\**\s+برقم مرجعي/,
  },

  // S7: يرجى العلم انه تم تنفيذ تحويل لحظي بمبلغ 150.00 جم من حسابك المنتهي بـ ********2222 برقم مرجعي e5f6a7b8 بتاريخ 2026-09-11 16:08 للمزيد، برجاء الاتصال بـ 19666
  {
    id: 'cib.instant-transfer-unnamed.ar.v1',
    bank: 'CIB',
    senders: ['CIB'],
    event: 'purchase',
    merchant: 'InstaPay transfer',
    // Matches Arabic instant transfer without recipient name, with fixed merchant 'InstaPay transfer', currency token 'جم', spelling variants انه/إنه, and optional tatweel بـ?.
    pattern: /^يرجى العلم [إا]نه تم تنفيذ تحويل لحظي بمبلغ\s+(?<amount>[\d,]+(?:\.\d{2})?)\s+(?<currency>جم|[A-Z]{3})\s+من حسابك المنتهي بـ?\s*\**(?<last4>\d{4})\**\s+برقم مرجعي/,
  },
];

export const CIB_IGNORE_RULES: readonly SmsIgnoreRule[] = [
  // S8: كشف حساب شهر أغسطس 2026 لبطاقتك الائتمانية المنتهية بـ 3333 هو 912.40 جم ، الحد الأدنى للسداد قبل 10/09 هو 890.15 جم .يمكنك الاطلاع على تفاصيل كشف الحساب من خلال الرابط التالي: https://cib.eg/hk9
  {
    id: 'cib.statement.ar.v1',
    senders: ['CIB'],
    // Not \b: without the u flag, \b only knows ASCII word characters,
    // so it never fires after an Arabic letter and the rule never matched.
    pattern: /^كشف حساب شهر\s/,
  },
];
