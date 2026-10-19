import { describe, expect, it } from 'vitest';
import {
  emailField,
  newPasswordField,
  passwordInputField,
  safeText,
} from '../../src/api/validation/fields.js';
import { ingestSmsBody } from '../../src/api/validation/schemas.js';

const NUL = String.fromCharCode(0);
const BACKSPACE = String.fromCharCode(8);
const RLO = String.fromCharCode(0x202e);
const LRI = String.fromCharCode(0x2066);
const COMBINING_ACUTE = String.fromCharCode(0x0301);

describe('safeText', () => {
  const name = safeText({ max: 30 });

  it('accepts Arabic untouched, and trims it', () => {
    expect(name.parse('  كارفور المعادي  ')).toBe('كارفور المعادي');
  });

  it('accepts mixed Arabic and English, which needs no bidi controls', () => {
    expect(name.parse('Carrefour كارفور')).toBe('Carrefour كارفور');
  });

  it('rejects NUL and other control characters', () => {
    expect(name.safeParse(`abc${NUL}def`).success).toBe(false);
    expect(name.safeParse(`admin${BACKSPACE}x`).success).toBe(false);
  });

  it('rejects bidirectional override and isolate characters — Trojan Source', () => {
    expect(name.safeParse(`abc${RLO}def`).success).toBe(false);
    expect(name.safeParse(`abc${LRI}def`).success).toBe(false);
  });

  it('rejects line breaks unless multiline is allowed', () => {
    expect(name.safeParse('a\nb').success).toBe(false);
    expect(safeText({ max: 30, multiline: true }).parse('a\nb')).toBe('a\nb');
  });

  it('normalizes to NFC so visually identical strings compare equal', () => {
    const decomposed = `cafe${COMBINING_ACUTE}`;
    expect(decomposed).toHaveLength(5);
    expect(name.parse(decomposed)).toBe('café');
    expect(name.parse(decomposed)).toHaveLength(4);
  });

  it('enforces length AFTER trimming, so spaces cannot pad past the minimum', () => {
    expect(name.safeParse('   ').success).toBe(false);
    expect(safeText({ max: 3 }).safeParse('  abcd  ').success).toBe(false);
  });

  it('does NOT HTML-escape — escaping belongs on output', () => {
    expect(name.parse('M&S <Food>')).toBe('M&S <Food>');
  });
});

describe('emailField', () => {
  it('trims and lowercases', () => {
    expect(emailField.parse('  Youssef@Example.COM ')).toBe('youssef@example.com');
  });

  it('rejects over 254 characters', () => {
    expect(emailField.safeParse(`${'a'.repeat(250)}@b.com`).success).toBe(false);
  });
});

describe('password fields', () => {
  it('does not trim — a trailing space is part of the password', () => {
    expect(passwordInputField.parse('secret pass ')).toBe('secret pass ');
  });

  it('enforces the minimum length for new passwords only', () => {
    expect(newPasswordField.safeParse('elevenchars').success).toBe(false);
    expect(newPasswordField.safeParse('twelve chars').success).toBe(true);
    // Login accepts a short password: the account may predate the policy.
    expect(passwordInputField.safeParse('short').success).toBe(true);
  });

  it('caps length at 128 as a denial-of-service guard', () => {
    expect(passwordInputField.safeParse('x'.repeat(129)).success).toBe(false);
  });

  it('rejects NUL', () => {
    expect(passwordInputField.safeParse(`pass${NUL}word`).success).toBe(false);
  });
});

describe('ingestSmsBody', () => {
  it('accepts a multi-line Arabic SMS and converts its time to UTC', () => {
    const parsed = ingestSmsBody.parse({
      sender: 'NBE',
      body: 'تم خصم\n500 جنيه',
      receivedAt: '2026-09-21T10:00:00+03:00',
    });
    expect(parsed.body).toBe('تم خصم\n500 جنيه');
    expect(parsed.receivedAt.toISOString()).toBe('2026-09-21T07:00:00.000Z');
  });

  it('rejects a timestamp with no timezone offset', () => {
    // Egypt observes DST again, so "10:00" alone is ambiguous by an hour.
    expect(
      ingestSmsBody.safeParse({ sender: 'NBE', body: 'x', receivedAt: '2026-09-21T10:00:00' }).success,
    ).toBe(false);
  });
});
