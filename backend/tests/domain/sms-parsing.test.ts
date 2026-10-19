import { describe, expect, it } from 'vitest';
import {
  currencyFromSmsToken,
  normalizeSmsText,
  parseSmsAmount,
  parseSmsBalance,
} from '../../src/domain/sms/sms-text.js';
import {
  isTransferLeg,
  parseWithTemplates,
  transactionShapeOf,
  validateCatalog,
  type SmsCatalog,
  type SmsTemplate,
} from '../../src/domain/sms/sms-template.js';
import { BANK_CATALOG } from '../../src/domain/sms/banks/index.js';
import { DomainError } from '../../src/domain/errors.js';

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

describe('normalizeSmsText', () => {
  it('turns Arabic-Indic digits and separators into ASCII', () => {
    expect(normalizeSmsText(toArabicDigits('1,250.50'))).toBe('1,250.50');
  });

  it('turns Persian-style digits into ASCII too', () => {
    expect(normalizeSmsText(String.fromCharCode(0x06f1, 0x06f2))).toBe('12');
  });

  it('collapses line breaks, tabs and no-break spaces into single spaces', () => {
    expect(normalizeSmsText(`  EGP\n\t500${String.fromCharCode(0x00a0)}at  CARREFOUR `)).toBe('EGP 500 at CARREFOUR');
  });

  it('leaves Arabic letters alone', () => {
    expect(normalizeSmsText('كارفور المعادي')).toBe('كارفور المعادي');
  });
});

describe('parseSmsAmount', () => {
  it.each([
    ['1,250.50', '1250.50'],
    ['1250.5', '1250.5'],
    ['500', '500'],
    ['12,345,678.00', '12345678.00'],
  ])('reads %s as %s', (raw, expected) => {
    expect(parseSmsAmount(raw)).toBe(expected);
  });

  it('reads Arabic-Indic amounts', () => {
    expect(parseSmsAmount(toArabicDigits('1,250.50'))).toBe('1250.50');
  });

  it.each([
    ['1.250,00', 'European style — guessing could turn 1,250 into 1.25'],
    ['12,50', 'comma not on a thousands boundary'],
    ['1,2500', 'bad grouping'],
    ['1.234', 'three decimals'],
    ['-500', 'negative'],
    ['abc', 'not a number'],
    ['', 'empty'],
  ])('rejects %s (%s)', (raw) => {
    expect(() => parseSmsAmount(raw)).toThrow(DomainError);
  });

  it('rejects a zero amount', () => {
    expect(() => parseSmsAmount('0.00')).toThrow(DomainError);
  });
});

describe('parseSmsBalance', () => {
  it('accepts zero, which is a real balance', () => {
    expect(parseSmsBalance('0.00')).toBe('0.00');
  });

  it('is as strict as parseSmsAmount about grouping', () => {
    expect(parseSmsBalance('19,381.88')).toBe('19381.88');
    expect(() => parseSmsBalance('1.250,00')).toThrow(DomainError);
  });
});

describe('currencyFromSmsToken', () => {
  it.each([
    ['EGP', 'EGP'],
    ['egp', 'EGP'],
    ['L.E', 'EGP'],
    ['جنيه', 'EGP'],
    ['ج.م', 'EGP'],
    ['جم', 'EGP'],
    ['USD', 'USD'],
    ['$', 'USD'],
    ['دولار', 'USD'],
  ])('maps %s to %s', (token, currency) => {
    expect(currencyFromSmsToken(token)).toBe(currency);
  });

  it('refuses a currency it does not know instead of assuming EGP', () => {
    expect(() => currencyFromSmsToken('EUR')).toThrow(DomainError);
  });
});

// ---------------------------------------------------------------------
// Template engine. The bank below is FICTIONAL — real CIB/NBE/Banque
// Misr formats get their own tests built from real (redacted) messages.
// ---------------------------------------------------------------------

const PURCHASE: SmsTemplate = {
  id: 'test.purchase.en',
  bank: 'Test Bank',
  senders: ['TESTBANK'],
  event: 'purchase',
  pattern: /card ending (?<last4>\d{4}) was charged (?<currency>[A-Z]{3}) (?<amount>[\d,.]+) at (?<merchant>.+?) on/i,
};

const PURCHASE_AR: SmsTemplate = {
  id: 'test.purchase.ar',
  bank: 'Test Bank',
  senders: ['TESTBANK'],
  event: 'purchase',
  pattern: /تم خصم (?<amount>[\d,.]+) (?<currency>جنيه|دولار) من البطاقة (?<last4>\d{4}) لدى (?<merchant>.+?) في/,
};

const WITHDRAWAL: SmsTemplate = {
  id: 'test.atm',
  bank: 'Test Bank',
  senders: ['TESTBANK'],
  event: 'withdrawal',
  pattern: /ATM withdrawal of (?<amount>[\d,.]+) from card (?<last4>\d{4})/i,
  currency: 'EGP',
  merchant: 'ATM',
};

const CATALOG: SmsCatalog = {
  templates: [PURCHASE, PURCHASE_AR, WITHDRAWAL],
  ignoreRules: BANK_CATALOG.ignoreRules,
};

describe('parseWithTemplates', () => {
  it('parses an English purchase', () => {
    const result = parseWithTemplates(
      CATALOG,
      'TESTBANK',
      'Your card ending 1234 was charged EGP 1,250.50 at CARREFOUR MAADI on 21/09 10:15',
    );
    expect(result).toEqual({
      outcome: 'transaction',
      templateId: 'test.purchase.en',
      parsed: {
        bank: 'Test Bank',
        event: 'purchase',
        amount: '1250.50',
        currency: 'EGP',
        merchant: 'CARREFOUR MAADI',
        last4: '1234',
        availableAmount: null,
        availableCurrency: null,
      },
    });
  });

  it('parses an Arabic purchase written with Arabic-Indic digits', () => {
    const body = `تم خصم ${toArabicDigits('350.00')} جنيه من البطاقة ${toArabicDigits('1234')} لدى كارفور المعادي في ${toArabicDigits('21/09')}`;
    const result = parseWithTemplates(CATALOG, 'TESTBANK', body);
    expect(result.outcome).toBe('transaction');
    if (result.outcome !== 'transaction') return;
    expect(result.parsed).toMatchObject({ amount: '350.00', currency: 'EGP', merchant: 'كارفور المعادي', last4: '1234' });
  });

  it('matches the sender regardless of case and spacing', () => {
    const result = parseWithTemplates(CATALOG, ' testbank ', 'ATM withdrawal of 2,000 from card 1234');
    expect(result).toMatchObject({ outcome: 'transaction', parsed: { merchant: 'ATM', currency: 'EGP', amount: '2000' } });
  });

  it('never parses a message from an unknown sender, even if it looks like a purchase', () => {
    const result = parseWithTemplates(
      CATALOG,
      '+201001234567',
      'Your card ending 1234 was charged EGP 500.00 at SCAM on 21/09',
    );
    expect(result).toEqual({ outcome: 'not-transaction', reason: 'sender is not a known bank' });
  });

  it('ignores an OTP even though it quotes an amount and a merchant', () => {
    const result = parseWithTemplates(
      CATALOG,
      'TESTBANK',
      'Your OTP is 482913. Your card ending 1234 was charged EGP 500.00 at AMAZON on confirm',
    );
    expect(result.outcome).toBe('not-transaction');
  });

  it('ignores an Arabic verification code', () => {
    expect(parseWithTemplates(CATALOG, 'TESTBANK', 'كود التحقق الخاص بك هو 1234').outcome).toBe('not-transaction');
  });

  it('reports a known-bank message nothing understood as unrecognized', () => {
    expect(parseWithTemplates(CATALOG, 'TESTBANK', 'Dear customer, your statement is ready')).toEqual({
      outcome: 'unrecognized',
      reason: 'no template matched',
    });
  });

  it('reports an unreadable amount instead of trying the next template', () => {
    const result = parseWithTemplates(
      CATALOG,
      'TESTBANK',
      'Your card ending 1234 was charged EGP 1.250,00 at CARREFOUR on 21/09',
    );
    expect(result.outcome).toBe('unrecognized');
    if (result.outcome !== 'unrecognized') return;
    expect(result.reason).toContain('test.purchase.en');
  });

  it('reports an unsupported currency instead of assuming EGP', () => {
    const result = parseWithTemplates(CATALOG, 'TESTBANK', 'Your card ending 1234 was charged EUR 50.00 at IKEA on 21/09');
    expect(result.outcome).toBe('unrecognized');
  });
});

describe('validateCatalog', () => {
  it('accepts the shipped catalog', () => {
    expect(() => validateCatalog(BANK_CATALOG)).not.toThrow();
  });

  it('accepts the test catalog', () => {
    expect(() => validateCatalog(CATALOG)).not.toThrow();
  });

  it('rejects a /g regex, which would match a message only every other time', () => {
    const bad = { ...PURCHASE, pattern: new RegExp(PURCHASE.pattern.source, 'gi') };
    expect(() => validateCatalog({ templates: [bad], ignoreRules: [] })).toThrow(/g or y flag/);
  });

  it('rejects a template with no amount group', () => {
    const bad = { ...WITHDRAWAL, pattern: /ATM withdrawal from card (?<last4>\d{4})/ };
    expect(() => validateCatalog({ templates: [bad], ignoreRules: [] })).toThrow(/amount/);
  });

  it('rejects a template that can never know its currency', () => {
    const noCurrency: SmsTemplate = { ...WITHDRAWAL };
    delete noCurrency.currency;
    expect(() => validateCatalog({ templates: [noCurrency], ignoreRules: [] })).toThrow(/currency/);
  });

  it('rejects a template with a balance amount but no balance currency', () => {
    const bad = { ...PURCHASE, pattern: new RegExp(`${PURCHASE.pattern.source}(?: left (?<available>[\\d.]+))?`) };
    expect(() => validateCatalog({ templates: [bad], ignoreRules: [] })).toThrow(/availableCurrency/);
  });

  it('rejects duplicate ids', () => {
    expect(() => validateCatalog({ templates: [PURCHASE, PURCHASE], ignoreRules: [] })).toThrow(/Duplicate/);
  });
});

describe('transactionShapeOf', () => {
  it('records a refund as a CREDIT expense, so it nets against the category', () => {
    expect(transactionShapeOf('refund')).toEqual({ kind: 'expense', direction: 'credit' });
  });

  it('records a deposit as income', () => {
    expect(transactionShapeOf('deposit')).toEqual({ kind: 'income', direction: 'credit' });
  });

  it('records a bank charge as a fee', () => {
    expect(transactionShapeOf('fee')).toEqual({ kind: 'fee', direction: 'debit' });
  });
});

describe('isTransferLeg', () => {
  it('marks the two halves of an internal transfer, and nothing else', () => {
    expect(isTransferLeg('transfer-out')).toBe(true);
    expect(isTransferLeg('card-payment')).toBe(true);
    for (const event of ['purchase', 'refund', 'withdrawal', 'deposit', 'fee'] as const) {
      expect(isTransferLeg(event)).toBe(false);
    }
  });
});
