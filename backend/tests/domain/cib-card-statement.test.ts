import { describe, expect, it } from 'vitest';
import { parseCibCardStatements } from '../../src/domain/statements/cib-card-statement.js';
import type { PdfTextRun } from '../../src/domain/statements/card-statement.js';
import { DomainError } from '../../src/domain/errors.js';

/*
 * Pages built by hand in the CIB layout (see cib-card-statement.ts), with
 * FAKE card digits, merchants and amounts. Real statements never go in a
 * test: they carry a name, an address and a card number.
 */
const at = (x: number, y: number, text: string): PdfTextRun => ({ text, x, right: x + text.length * 5, y });

interface Summary {
  period?: string;
  due?: string;
  limit?: string;
  available?: string;
  total?: string;
  minimum?: string;
  card?: string;
}

function summary(s: Summary = {}, top = 280): PdfTextRun[] {
  const rows: [string, string | undefined][] = [
    ['Type of Credit Card', 'MASTER TEST'],
    ['Card Number', s.card ?? '5555 **** **** 1111'],
    ['Card Limit', s.limit ?? '20000'],
    ['Total Amount Due', s.total ?? '1200.00'],
    ['Minimum Payment Due', s.minimum ?? '60.00'],
    ['Payment Due Date', s.due ?? '2026-08-10'],
    ['Statement Date', s.period ?? 'Jul-26'],
    ['Available Credit Limit', s.available ?? '18800.00'],
  ];
  return rows.flatMap(([label, value], i) => {
    const y = top + i * 18;
    const cells = [at(54, y, label), at(520, y, 'تاريخ')];
    return value === undefined ? cells : [...cells, at(180, y, value)];
  });
}

/** One transaction row: the posting date sits 1pt above the rest. */
function line(y: number, date: string, posting: string, description: string, amount: string): PdfTextRun[] {
  return [at(151, y - 1, posting), at(55, y, date), at(250, y, description), at(530, y, amount)];
}

const balance = (y: number, which: 'OPENING' | 'CLOSING', amount: string) => [
  at(151, y - 1, 'Jul-26'),
  at(250, y, `${which} BALANCE`),
  at(530, y, amount),
];

/** A July 2026 statement: 1000 opening + 450 + 25 - 275 = 1200 closing. */
function julyStatement(): PdfTextRun[] {
  return [
    ...summary(),
    ...balance(480, 'OPENING', '1,000.00'),
    ...line(493, '30-06', '02-07', 'TEST CAFE CAIRO', '450.00'),
    ...line(506, '05-07', '06-07', 'TEST SOFTWARE SUB SAN', '25.00'),
    at(250, 519, 'FRANCISCO'),
    ...line(532, '00-00', '00-00', 'USD1,00', '.00'),
    ...line(545, '07-07', '07-07', 'PAYMENT RECEIVED INTERNET', '275.00 CR'),
    at(250, 560, 'TEST CASHBACK'),
    at(549, 560, '0.00'),
    at(250, 574, 'Test CashBack Jul-26'),
    at(538, 574, '12.50'),
    ...balance(600, 'CLOSING', '1200.00'),
  ];
}

describe('parseCibCardStatements', () => {
  it('reads the summary and every line of a statement', () => {
    const [statement, ...rest] = parseCibCardStatements([julyStatement()]);
    expect(rest).toEqual([]);
    expect(statement).toEqual({
      cardLast4: '1111',
      period: { year: 2026, month: 7 },
      dueDate: '2026-08-10',
      creditLimit: '20000.00',
      availableCredit: '18800.00',
      totalDue: '1200.00',
      minimumDue: '60.00',
      openingBalance: '1000.00',
      closingBalance: '1200.00',
      lines: [
        { transactionDate: '2026-06-30', postingDate: '2026-07-02', description: 'TEST CAFE CAIRO', amount: '450.00', direction: 'debit', notes: [] },
        {
          transactionDate: '2026-07-05',
          postingDate: '2026-07-06',
          // The wrapped row joins its line; the 00-00 row becomes a note.
          description: 'TEST SOFTWARE SUB SAN FRANCISCO',
          amount: '25.00',
          direction: 'debit',
          notes: ['USD1,00'],
        },
        { transactionDate: '2026-07-07', postingDate: '2026-07-07', description: 'PAYMENT RECEIVED INTERNET', amount: '275.00', direction: 'credit', notes: [] },
      ],
    });
  });

  it('reads runs in any order, as a PDF may store them', () => {
    const shuffled = [...julyStatement()].reverse();
    expect(parseCibCardStatements([shuffled])[0]!.lines).toHaveLength(3);
  });

  it('dates a December line on the January statement in the year before', () => {
    const page = [
      ...summary({ period: 'Jan-26', due: '2026-02-10', total: '100.00' }),
      ...balance(480, 'OPENING', '.00'),
      ...line(493, '29-12', '02-01', 'TEST SHOP', '100.00'),
      ...balance(520, 'CLOSING', '100.00'),
    ];
    expect(parseCibCardStatements([page])[0]!.lines[0]).toMatchObject({
      transactionDate: '2025-12-29',
      postingDate: '2026-01-02',
    });
  });

  it('follows the table onto the next page and reads several statements', () => {
    const june = [
      ...summary({ period: 'Jun-26', due: '2026-07-10' }),
      ...balance(480, 'OPENING', '.00'),
      ...line(493, '03-06', '04-06', 'TEST SHOP', '1,040.83'),
    ];
    const juneContinued = [
      ...line(30, '04-06', '04-06', 'Stamp Duty', '.83'),
      ...line(44, '05-06', '05-06', 'Reverse Annual fee', '41.66 CR'),
      ...balance(70, 'CLOSING', '1000.00'),
      // The installment table after CLOSING is not part of the statement.
      at(44, 360, 'TEST INSTALLMENT'),
      at(194, 360, '141.33'),
    ];
    const terms = [at(30, 400, 'Unless an objection is received within 30 days')];

    const statements = parseCibCardStatements([june, juneContinued, terms, julyStatement()]);
    expect(statements.map((s) => s.period)).toEqual([
      { year: 2026, month: 6 },
      { year: 2026, month: 7 },
    ]);
    expect(statements[0]!.lines.map((l) => [l.amount, l.direction])).toEqual([
      ['1040.83', 'debit'],
      ['0.83', 'debit'],
      ['41.66', 'credit'],
    ]);
  });

  it('reads a closing balance in credit as negative', () => {
    const page = [
      ...summary(),
      ...balance(480, 'OPENING', '100.00'),
      ...line(493, '07-07', '07-07', 'PAYMENT RECEIVED INTERNET', '150.00 CR'),
      ...balance(520, 'CLOSING', '50.00 CR'),
    ];
    expect(parseCibCardStatements([page])[0]!.closingBalance).toBe('-50.00');
  });

  it('refuses a statement that does not add up, naming the month', () => {
    const page = julyStatement().map((r) => (r.text === '1200.00' && r.y === 600 ? { ...r, text: '1210.00' } : r));
    expect(() => parseCibCardStatements([page])).toThrow(/2026-07 statement does not add up/);
  });

  it('refuses a table that starts before its summary is complete', () => {
    // Drop the due-date row entirely: its label and its value.
    const dueRowY = summary().find((r) => r.text === 'Payment Due Date')!.y;
    const page = [...summary().filter((r) => r.y !== dueRowY), ...balance(480, 'OPENING', '.00')];
    expect(() => parseCibCardStatements([page])).toThrow(/missing: dueDate/);
  });

  it('refuses a file cut off before CLOSING BALANCE', () => {
    const cut = julyStatement().filter((r) => r.y < 590);
    expect(() => parseCibCardStatements([cut])).toThrow(/no CLOSING BALANCE/);
  });

  it('refuses a dated line with an unreadable amount', () => {
    const page = [
      ...summary(),
      ...balance(480, 'OPENING', '.00'),
      ...line(493, '01-07', '01-07', 'TEST SHOP', '1.250,00'),
      ...balance(520, 'CLOSING', '.00'),
    ];
    expect(() => parseCibCardStatements([page])).toThrow(DomainError);
  });

  it('refuses an impossible date instead of rolling it over', () => {
    const page = [
      ...summary(),
      ...balance(480, 'OPENING', '.00'),
      ...line(493, '31-06', '01-07', 'TEST SHOP', '10.00'),
      ...balance(520, 'CLOSING', '10.00'),
    ];
    expect(() => parseCibCardStatements([page])).toThrow(DomainError);
  });

  it('finds no statement in a PDF that is not one', () => {
    expect(parseCibCardStatements([[at(30, 100, 'Hello'), at(30, 120, 'Card Limit is not a summary here')]])).toEqual([]);
  });
});
