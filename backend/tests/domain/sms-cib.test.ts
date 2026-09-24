import { describe, expect, it } from 'vitest';
import { BANK_CATALOG } from '../../src/domain/sms/banks/index.js';
import { parseWithTemplates, validateCatalog } from '../../src/domain/sms/sms-template.js';

/** Writes ASCII digits/separators the way an Arabic-language phone does. */
function toArabicDigits(text: string): string {
  return [...text]
    .map((ch) => {
      if (ch >= '0' && ch <= '9') return String.fromCharCode(0x0660 + Number(ch));
      if (ch === '.') return String.fromCharCode(0x066b);
      if (ch === ',') return String.fromCharCode(0x066c);
      return ch;
    })
    .join('');
}

describe('CIB SMS parsing', () => {
  it('validates that BANK_CATALOG does not throw', () => {
    expect(() => validateCatalog(BANK_CATALOG)).not.toThrow();
  });

  describe('Sample messages S1-S10', () => {
    it('S1: credit card purchase, English, variant ending with#', () => {
      const msg = 'Your credit card ending with#1111 was charged for EGP 3150.00 at TEST ONLINE SHO on 11/09/26 at 10:15. Card available limit is EGP 10000.00. For more details, please visit https://cib.eg/mb';
      const result = parseWithTemplates(BANK_CATALOG, 'CIB', msg);

      expect(result).toEqual({
        outcome: 'transaction',
        templateId: 'cib.card-purchase.en.v1',
        parsed: {
          bank: 'CIB',
          event: 'purchase',
          currency: 'EGP',
          amount: '3150.00',
          merchant: 'TEST ONLINE SHO',
          last4: '1111',
          availableAmount: '10000.00',
          availableCurrency: 'EGP',
        },
      });
    });

    it('S2: credit card purchase, English, variant # (note USD)', () => {
      const msg = 'Your credit card #1111 was charged for USD 21.60 at TEST SOFTWARE PL on 07/09/26 at 11:40. Available limit is 10000.00 and the available international limit to use is EGP 50000';
      const result = parseWithTemplates(BANK_CATALOG, 'CIB', msg);

      expect(result).toEqual({
        outcome: 'transaction',
        templateId: 'cib.card-purchase.en.v1',
        parsed: {
          bank: 'CIB',
          event: 'purchase',
          currency: 'USD',
          amount: '21.60',
          merchant: 'TEST SOFTWARE PL',
          last4: '1111',
          availableAmount: null,
          availableCurrency: null,
        },
      });
    });

    it('S3: debit card purchase, Arabic', () => {
      const msg = 'تم خصم مبلغ EGP 5.00 من بطاقة الخصم المباشر المنتهية بـ **4444 عند Uber في 03/08/26 14:05 ، الرصيد المتاح EGP 1000.00';
      const result = parseWithTemplates(BANK_CATALOG, 'CIB', msg);

      expect(result).toEqual({
        outcome: 'transaction',
        templateId: 'cib.debit-purchase.ar.v1',
        parsed: {
          bank: 'CIB',
          event: 'purchase',
          currency: 'EGP',
          amount: '5.00',
          merchant: 'Uber',
          last4: '4444',
          availableAmount: '1000.00',
          availableCurrency: 'EGP',
        },
      });
    });

    it('S4: debit card refund, Arabic (currency AFTER amount)', () => {
      const msg = 'تم اضافة المعاملة من Uber بقيمة 5.00 EGP إلى بطاقتك المنتهية بـ **4444 . الرصيد المتاح EGP 1005.00';
      const result = parseWithTemplates(BANK_CATALOG, 'CIB', msg);

      expect(result).toEqual({
        outcome: 'transaction',
        templateId: 'cib.debit-refund.ar.v1',
        parsed: {
          bank: 'CIB',
          event: 'refund',
          currency: 'EGP',
          amount: '5.00',
          merchant: 'Uber',
          last4: '4444',
          availableAmount: '1005.00',
          availableCurrency: 'EGP',
        },
      });
    });

    it('S5: debit card ATM withdrawal, Arabic', () => {
      const msg = 'تم سحب مبلغ EGP 1000.00 من بطاقة الخصم المباشر المنتهية بـ **4444 من TEST ATM101 في 09/08/26 13:40 ، الرصيد المتاح EGP 500.00';
      const result = parseWithTemplates(BANK_CATALOG, 'CIB', msg);

      expect(result).toEqual({
        outcome: 'transaction',
        templateId: 'cib.atm-withdrawal.ar.v1',
        parsed: {
          bank: 'CIB',
          event: 'withdrawal',
          currency: 'EGP',
          amount: '1000.00',
          merchant: 'TEST ATM101',
          last4: '4444',
          availableAmount: '500.00',
          availableCurrency: 'EGP',
        },
      });
    });

    it('S6: instant transfer OUT to a named person, Arabic', () => {
      const msg = 'يرجى العلم انه تم تنفيذ تحويل لحظي بمبلغ 800.00 جم إلى TEST FRIEND NAME من حسابك المنتهي بـ ********2222 برقم مرجعي a1b2c3d4 بتاريخ 2026-09-11 14:16 للمزيد، برجاء الاتصال بـ 19666';
      const result = parseWithTemplates(BANK_CATALOG, 'CIB', msg);

      expect(result).toEqual({
        outcome: 'transaction',
        templateId: 'cib.instant-transfer-named.ar.v1',
        parsed: {
          bank: 'CIB',
          event: 'purchase',
          currency: 'EGP',
          amount: '800.00',
          merchant: 'TEST FRIEND NAME',
          last4: '2222',
          availableAmount: null,
          availableCurrency: null,
        },
      });
    });

    it('S7: instant transfer OUT with no recipient name, Arabic', () => {
      const msg = 'يرجى العلم انه تم تنفيذ تحويل لحظي بمبلغ 150.00 جم من حسابك المنتهي بـ ********2222 برقم مرجعي e5f6a7b8 بتاريخ 2026-09-11 16:08 للمزيد، برجاء الاتصال بـ 19666';
      const result = parseWithTemplates(BANK_CATALOG, 'CIB', msg);

      expect(result).toEqual({
        outcome: 'transaction',
        templateId: 'cib.instant-transfer-unnamed.ar.v1',
        parsed: {
          bank: 'CIB',
          event: 'purchase',
          currency: 'EGP',
          amount: '150.00',
          merchant: 'InstaPay transfer',
          last4: '2222',
          availableAmount: null,
          availableCurrency: null,
        },
      });
    });

    it('S8: credit card monthly statement, Arabic (NOT a transaction)', () => {
      const msg = 'كشف حساب شهر أغسطس 2026 لبطاقتك الائتمانية المنتهية بـ 3333 هو 912.40 جم ، الحد الأدنى للسداد قبل 10/09 هو 890.15 جم .يمكنك الاطلاع على تفاصيل كشف الحساب من خلال الرابط التالي: https://cib.eg/hk9';
      const result = parseWithTemplates(BANK_CATALOG, 'CIB', msg);

      expect(result).toEqual({
        outcome: 'not-transaction',
        reason: 'matched ignore rule cib.statement.ar.v1',
      });
    });

    it('S9: account debit for transfer to another account, English (transfer half A)', () => {
      const msg = 'Your account ending with ********2222 is debited with amount EGP 1,200.00DR On 07 SEP 2026 with transfer to another account. For more information, please contact 19666.';
      const result = parseWithTemplates(BANK_CATALOG, 'CIB', msg);

      expect(result).toEqual({
        outcome: 'transaction',
        templateId: 'cib.transfer-out.en.v1',
        parsed: {
          bank: 'CIB',
          event: 'transfer-out',
          currency: 'EGP',
          amount: '1200.00',
          merchant: 'Transfer to another account',
          last4: '2222',
          availableAmount: null,
          availableCurrency: null,
        },
      });
    });

    it('S10: credit card bill payment received, Arabic (transfer half B)', () => {
      const msg = 'تم سداد مبلغ 1200.00 جم فى بطاقتكم الائتمانية المنتهية بـ 1111 بتاريخ 26-09-07';
      const result = parseWithTemplates(BANK_CATALOG, 'CIB', msg);

      expect(result).toEqual({
        outcome: 'transaction',
        templateId: 'cib.card-payment.ar.v1',
        parsed: {
          bank: 'CIB',
          event: 'card-payment',
          currency: 'EGP',
          amount: '1200.00',
          merchant: 'Credit card payment',
          last4: '1111',
          availableAmount: null,
          availableCurrency: null,
        },
      });
    });

    it('reads the transfer halves in their variants', () => {
      const debit = (digits: string, amount: string) =>
        `Your account ending with ${digits} is debited with amount EGP ${amount} On 07 SEP 2026 with transfer to another account.`;
      for (const [digits, amount] of [['2222********', '1,200.00DR'], ['2222', '1200.00 DR'], ['**2222', '1200.00']]) {
        expect(parseWithTemplates(BANK_CATALOG, 'CIB', debit(digits!, amount!))).toMatchObject({
          outcome: 'transaction',
          parsed: { event: 'transfer-out', amount: '1200.00', last4: '2222' },
        });
      }

      const payment = toArabicDigits('تم سداد مبلغ 1,200.00 جم في بطاقتكم الائتمانية المنتهية ب **1111 بتاريخ 26-09-07');
      expect(parseWithTemplates(BANK_CATALOG, 'CIB', payment)).toMatchObject({
        outcome: 'transaction',
        parsed: { event: 'card-payment', amount: '1200.00', last4: '1111' },
      });
    });
  });

  describe('Money coming in', () => {
    it('S11: instant transfer IN from a named person is a deposit from them', () => {
      const msg = 'يرجى العلم انه تم تنفيذ تحويل لحظي بمبلغ 2,500.00 جم إلى حسابك المنتهي بـ ********2222 من SARA HASSAN TEST برقم مرجعي c9d0e1f2 بتاريخ 2026-09-12 18:47 للمزيد، برجاء الاتصال بـ 19666';
      expect(parseWithTemplates(BANK_CATALOG, 'CIB', msg)).toEqual({
        outcome: 'transaction',
        templateId: 'cib.instant-transfer-in.ar.v1',
        parsed: {
          bank: 'CIB',
          event: 'deposit',
          currency: 'EGP',
          amount: '2500.00',
          merchant: 'SARA HASSAN TEST',
          last4: '2222',
          availableAmount: null,
          availableCurrency: null,
        },
      });
    });

    it('S11 with an Arabic sender name and the "الى" spelling', () => {
      const msg = 'يرجى العلم إنه تم تنفيذ تحويل لحظي بمبلغ 300.00 جم الى حسابك المنتهي ب 2222 من سارة حسن برقم مرجعي c9d0e1f2 بتاريخ 2026-09-12 18:47';
      expect(parseWithTemplates(BANK_CATALOG, 'CIB', msg)).toMatchObject({
        templateId: 'cib.instant-transfer-in.ar.v1',
        parsed: { event: 'deposit', amount: '300.00', merchant: 'سارة حسن', last4: '2222' },
      });
    });

    it('does not mistake an outgoing named transfer for an incoming one', () => {
      const msg = 'يرجى العلم انه تم تنفيذ تحويل لحظي بمبلغ 800.00 جم إلى TEST FRIEND NAME من حسابك المنتهي بـ ********2222 برقم مرجعي a1b2c3d4 بتاريخ 2026-09-11 14:16';
      expect(parseWithTemplates(BANK_CATALOG, 'CIB', msg)).toMatchObject({
        templateId: 'cib.instant-transfer-named.ar.v1',
        parsed: { event: 'purchase' },
      });
    });
  });

  describe('Available balance', () => {
    it('reads a zero balance: 0.00 is a real balance', () => {
      const msg = 'تم خصم مبلغ EGP 5.00 من بطاقة الخصم المباشر المنتهية بـ **4444 عند Uber في 03/08/26 14:05 ، الرصيد المتاح EGP 0.00';
      expect(parseWithTemplates(BANK_CATALOG, 'CIB', msg)).toMatchObject({
        parsed: { amount: '5.00', availableAmount: '0.00', availableCurrency: 'EGP' },
      });
    });

    it('reads a grouped balance written in Arabic-Indic digits', () => {
      const msg = toArabicDigits('تم سحب مبلغ EGP 400.00 من بطاقة الخصم المباشر المنتهية بـ **4444 من TESTBANK ATM في 31/08/26 03:56 ، الرصيد المتاح EGP 19,381.88');
      expect(parseWithTemplates(BANK_CATALOG, 'CIB', msg)).toMatchObject({
        parsed: { amount: '400.00', availableAmount: '19381.88', availableCurrency: 'EGP' },
      });
    });

    it('still parses the purchase when the SMS states no balance', () => {
      const msg = 'تم خصم مبلغ EGP 5.00 من بطاقة الخصم المباشر المنتهية بـ **4444 عند Uber في 03/08/26 14:05';
      expect(parseWithTemplates(BANK_CATALOG, 'CIB', msg)).toMatchObject({
        outcome: 'transaction',
        parsed: { amount: '5.00', availableAmount: null, availableCurrency: null },
      });
    });

    it('drops an unreadable balance but keeps the purchase', () => {
      const msg = 'تم خصم مبلغ EGP 5.00 من بطاقة الخصم المباشر المنتهية بـ **4444 عند Uber في 03/08/26 14:05 ، الرصيد المتاح XYZ 1000.00';
      expect(parseWithTemplates(BANK_CATALOG, 'CIB', msg)).toMatchObject({
        outcome: 'transaction',
        parsed: { amount: '5.00', availableAmount: null, availableCurrency: null },
      });
    });
  });

  describe('Robustness rules', () => {
    it('handles card/account digits with stars on either side or none', () => {
      const variations = [
        '********2222',
        '2222********',
        '**4444',
        '4444**',
        '4444',
      ];

      for (const cardPart of variations) {
        const expectedLast4 = cardPart.replace(/\*/g, '');
        const msg = `تم خصم مبلغ EGP 5.00 من بطاقة الخصم المباشر المنتهية بـ ${cardPart} عند Uber في 03/08/26 14:05 ، الرصيد المتاح EGP 1000.00`;
        const result = parseWithTemplates(BANK_CATALOG, 'CIB', msg);
        expect(result).toMatchObject({
          outcome: 'transaction',
          parsed: {
            last4: expectedLast4,
          },
        });
      }
    });

    it('handles "بـ" with and without tatweel (U+0640)', () => {
      const withTatweel = 'تم خصم مبلغ EGP 5.00 من بطاقة الخصم المباشر المنتهية بـ **4444 عند Uber في 03/08/26 14:05 ، الرصيد المتاح EGP 1000.00';
      const withoutTatweel = 'تم خصم مبلغ EGP 5.00 من بطاقة الخصم المباشر المنتهية ب **4444 عند Uber في 03/08/26 14:05 ، الرصيد المتاح EGP 1000.00';

      const res1 = parseWithTemplates(BANK_CATALOG, 'CIB', withTatweel);
      const res2 = parseWithTemplates(BANK_CATALOG, 'CIB', withoutTatweel);

      expect(res1).toMatchObject({ outcome: 'transaction', parsed: { last4: '4444' } });
      expect(res2).toMatchObject({ outcome: 'transaction', parsed: { last4: '4444' } });
    });

    it('handles Arabic spelling variants "في"/"فى" and "اضافة"/"إضافة"', () => {
      const msgYeh = 'تم خصم مبلغ EGP 5.00 من بطاقة الخصم المباشر المنتهية بـ **4444 عند Uber في 03/08/26 14:05 ، الرصيد المتاح EGP 1000.00';
      const msgAlefMaksura = 'تم خصم مبلغ EGP 5.00 من بطاقة الخصم المباشر المنتهية بـ **4444 عند Uber فى 03/08/26 14:05 ، الرصيد المتاح EGP 1000.00';

      expect(parseWithTemplates(BANK_CATALOG, 'CIB', msgYeh)).toMatchObject({ outcome: 'transaction' });
      expect(parseWithTemplates(BANK_CATALOG, 'CIB', msgAlefMaksura)).toMatchObject({ outcome: 'transaction' });

      const msgNoHamza = 'تم اضافة المعاملة من Uber بقيمة 5.00 EGP إلى بطاقتك المنتهية بـ **4444 . الرصيد المتاح EGP 1005.00';
      const msgHamza = 'تم إضافة المعاملة من Uber بقيمة 5.00 EGP إلى بطاقتك المنتهية بـ **4444 . الرصيد المتاح EGP 1005.00';

      expect(parseWithTemplates(BANK_CATALOG, 'CIB', msgNoHamza)).toMatchObject({ outcome: 'transaction' });
      expect(parseWithTemplates(BANK_CATALOG, 'CIB', msgHamza)).toMatchObject({ outcome: 'transaction' });
    });

    it('handles amounts with thousands separators', () => {
      const msg = 'Your credit card ending with#1111 was charged for EGP 1,250.00 at TEST ONLINE SHO on 11/09/26 at 10:15. Card available limit is EGP 10000.00.';
      const result = parseWithTemplates(BANK_CATALOG, 'CIB', msg);

      expect(result).toMatchObject({
        outcome: 'transaction',
        parsed: {
          amount: '1250.00',
        },
      });
    });

    it('handles whole message written with Arabic-Indic digits', () => {
      const msg = 'تم خصم مبلغ EGP 5.00 من بطاقة الخصم المباشر المنتهية بـ **4444 عند Uber في 03/08/26 14:05 ، الرصيد المتاح EGP 1000.00';
      const arabicDigitsMsg = toArabicDigits(msg);

      const result = parseWithTemplates(BANK_CATALOG, 'CIB', arabicDigitsMsg);
      expect(result).toMatchObject({
        outcome: 'transaction',
        parsed: {
          amount: '5.00',
          last4: '4444',
        },
      });
    });

    it('parses an Arabic-digit InstaPay transfer with stars after the digits', () => {
      const msg = toArabicDigits(
        'يرجى العلم انه تم تنفيذ تحويل لحظي بمبلغ 1,800.00 جم إلى TEST FRIEND NAME من حسابك المنتهي بـ 2222******** برقم مرجعي a1b2c3d4 بتاريخ 2026-09-11 14:16',
      );
      expect(parseWithTemplates(BANK_CATALOG, 'CIB', msg)).toMatchObject({
        outcome: 'transaction',
        templateId: 'cib.instant-transfer-named.ar.v1',
        parsed: { amount: '1800.00', currency: 'EGP', merchant: 'TEST FRIEND NAME', last4: '2222' },
      });
    });

    it('parses correctly with lowercase sender "cib"', () => {
      const msg = 'تم خصم مبلغ EGP 5.00 من بطاقة الخصم المباشر المنتهية بـ **4444 عند Uber في 03/08/26 14:05 ، الرصيد المتاح EGP 1000.00';
      const result = parseWithTemplates(BANK_CATALOG, 'cib', msg);

      expect(result).toMatchObject({
        outcome: 'transaction',
        parsed: {
          amount: '5.00',
          last4: '4444',
        },
      });
    });

    it('returns not-transaction for an unknown sender', () => {
      const msg = 'تم خصم مبلغ EGP 5.00 من بطاقة الخصم المباشر المنتهية بـ **4444 عند Uber في 03/08/26 14:05 ، الرصيد المتاح EGP 1000.00';
      const result = parseWithTemplates(BANK_CATALOG, '+201000000000', msg);

      expect(result).toEqual({
        outcome: 'not-transaction',
        reason: 'sender is not a known bank',
      });
    });

    it('ignores OTP messages from CIB as not-transaction', () => {
      const otpMsg = 'Your OTP is 123456 for EGP 500.00 at AMAZON';
      const result = parseWithTemplates(BANK_CATALOG, 'CIB', otpMsg);

      expect(result).toEqual({
        outcome: 'not-transaction',
        reason: 'matched ignore rule common.otp.v1',
      });
    });
  });
});
