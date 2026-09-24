import { Decimal } from 'decimal.js';
import { calendarDate, type CalendarDate } from '../calendar-date.js';
import { DomainError } from '../errors.js';
import type { CardStatement, PdfPages, PdfTextRun, StatementLine } from './card-statement.js';

/*
 * CIB credit card e-statement layout (x in points from the left edge).
 * One PDF holds several monthly statements, each laid out as:
 *
 *   summary block    label at x≈54, value at x≈180, Arabic label on the right
 *   OPENING BALANCE
 *   one row per line transaction date x≈55 | posting date x≈151 (1pt higher)
 *                    | description x≈250 | amount right-aligned, "CR" = credit
 *   CLOSING BALANCE
 *
 * The table may continue on the next page. A long description wraps onto
 * a row of its own, with no date and no amount. A "00-00" row holds a note
 * about the line above (the original "USD21,60" of a dollar charge).
 * Everything outside summary and table — terms, loyalty text, the
 * installment table after CLOSING — is ignored.
 */
const DATE_COLUMN_END = 120;
const POSTING_COLUMN_END = 220;
const DESCRIPTION_COLUMN_END = 480;
const SUMMARY_LABEL_END = 170;
/** A posting date sits about 1pt above its row; rows are ~13pt apart. */
const SAME_ROW = 3;

const DAY_MONTH = /^(\d{2})-(\d{2})$/;
/** "1,040.83", "99.99", ".83" (the bank drops a leading zero), optional " CR". */
const TABLE_AMOUNT = /^(\d{1,3}(?:,\d{3})+|\d*)\.(\d{2})(?:\s*CR)?$/;
/** Summary figures may have no decimals: a limit of "25000". */
const SUMMARY_AMOUNT = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

type SummaryField = 'cardLast4' | 'creditLimit' | 'totalDue' | 'minimumDue' | 'dueDate' | 'period' | 'availableCredit';

const SUMMARY_LABELS: ReadonlyMap<string, SummaryField> = new Map([
  ['card number', 'cardLast4'],
  ['card limit', 'creditLimit'],
  ['total amount due', 'totalDue'],
  ['minimum payment due', 'minimumDue'],
  ['payment due date', 'dueDate'],
  ['statement date', 'period'],
  ['available credit limit', 'availableCredit'],
]);
/** The first label of every statement: a new summary starts here. */
const SUMMARY_START = 'type of credit card';

type Summary = Omit<CardStatement, 'openingBalance' | 'closingBalance' | 'lines'>;

interface Row {
  /** Runs of this row, left to right. */
  runs: PdfTextRun[];
}

/**
 * Reads every statement in a CIB credit card e-statement PDF.
 *
 * Strict on purpose: a statement whose lines do not add up (opening +
 * debits - credits = closing) is refused with an error, never returned.
 * A misread line that slipped through would be a wrong number in your
 * history with nothing to show it is wrong.
 */
export function parseCibCardStatements(pages: PdfPages): CardStatement[] {
  const statements: CardStatement[] = [];
  let summary: Partial<Summary> = {};
  let table: { summary: Summary; opening: Decimal; lines: StatementLine[] } | null = null;

  for (const row of pages.flatMap(rowsOf)) {
    if (table === null) {
      if (descriptionOf(row) === 'OPENING BALANCE') {
        table = { summary: completeSummary(summary), opening: balanceOf(row), lines: [] };
        continue;
      }
      summary = readSummaryRow(row, summary);
      continue;
    }

    if (descriptionOf(row) === 'CLOSING BALANCE') {
      statements.push(finish(table.summary, table.opening, balanceOf(row), table.lines));
      summary = {};
      table = null;
      continue;
    }
    readTableRow(row, table.summary, table.lines);
  }

  if (table !== null) {
    throw new DomainError('A statement has an OPENING BALANCE but no CLOSING BALANCE; the file looks cut short');
  }
  return statements;
}

function rowsOf(page: readonly PdfTextRun[]): Row[] {
  const byY = page.filter((r) => r.text.trim() !== '').sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: { y: number; runs: PdfTextRun[] }[] = [];
  for (const run of byY) {
    const last = rows.at(-1);
    if (last !== undefined && run.y - last.y <= SAME_ROW) {
      last.runs.push(run);
    } else {
      rows.push({ y: run.y, runs: [run] });
    }
  }
  return rows.map((r) => ({ runs: r.runs.sort((a, b) => a.x - b.x) }));
}

const clean = (text: string) => text.replace(/\s+/g, ' ').trim();
const textIn = (row: Row, from: number, to: number) =>
  clean(row.runs.filter((r) => r.x >= from && r.x < to).map((r) => r.text).join(' '));

const descriptionOf = (row: Row) => textIn(row, POSTING_COLUMN_END, DESCRIPTION_COLUMN_END);
const amountText = (row: Row) => textIn(row, DESCRIPTION_COLUMN_END, Infinity);

function readSummaryRow(row: Row, summary: Partial<Summary>): Partial<Summary> {
  const label = textIn(row, 0, SUMMARY_LABEL_END).toLowerCase();
  if (label === SUMMARY_START) {
    return {};
  }
  const field = SUMMARY_LABELS.get(label);
  if (field === undefined) {
    return summary;
  }
  const value = textIn(row, SUMMARY_LABEL_END, DESCRIPTION_COLUMN_END);
  return { ...summary, ...readSummaryValue(field, value) };
}

function readSummaryValue(field: SummaryField, value: string): Partial<Summary> {
  switch (field) {
    case 'cardLast4': {
      // "5555 **** **** 1234": only the last 4 digits are ever printed whole.
      const digits = /(\d{4})$/.exec(value);
      if (digits === null) throw new DomainError(`Unreadable card number "${value}"`);
      return { cardLast4: digits[1]! };
    }
    case 'dueDate':
      return { dueDate: calendarDate(value) };
    case 'period': {
      // "Jul-26"
      const match = /^([A-Za-z]{3})-(\d{2})$/.exec(value);
      const month = match === null ? -1 : MONTHS.indexOf(match[1]!.toUpperCase());
      if (match === null || month === -1) throw new DomainError(`Unreadable statement date "${value}"`);
      return { period: { year: 2000 + Number(match[2]), month: month + 1 } };
    }
    default:
      return { [field]: summaryAmount(value) };
  }
}

function summaryAmount(value: string): string {
  if (!SUMMARY_AMOUNT.test(value)) {
    throw new DomainError(`Unreadable amount "${value}" in the statement summary`);
  }
  return new Decimal(value.replace(/,/g, '')).toFixed(2);
}

function completeSummary(summary: Partial<Summary>): Summary {
  const missing = (['cardLast4', 'period', 'dueDate', 'creditLimit', 'availableCredit', 'totalDue', 'minimumDue'] as const).filter(
    (f) => summary[f] === undefined,
  );
  if (missing.length > 0) {
    throw new DomainError(`A statement table starts before its summary is complete (missing: ${missing.join(', ')})`);
  }
  return summary as Summary;
}

function readTableRow(row: Row, summary: Summary, lines: StatementLine[]): void {
  const date = textIn(row, 0, DATE_COLUMN_END);
  const description = descriptionOf(row);
  const amount = amountText(row);
  const previous = lines.at(-1);

  if (date === '00-00') {
    // A note about the line above, e.g. the original dollar amount.
    if (previous === undefined) throw rowError(summary, 'a note row comes before any line', description);
    previous.notes.push(description);
    return;
  }

  if (date === '') {
    if (amount === '') {
      // A description too long for one row wraps onto the next.
      if (previous === undefined) throw rowError(summary, 'a text row comes before any line', description);
      previous.description = clean(`${previous.description} ${description}`);
      return;
    }
    // The cashback summary under the lines ("Test CashBack Mar-26
    // 120.00", "will be added to your account in 3 days"): what you
    // EARNED, credited later as a dated line of its own. Information, not
    // money. If such a row ever did count, the statement would stop
    // adding up and finish() would refuse it, so skipping is safe.
    readTableAmount(amount, summary);
    return;
  }

  const posting = textIn(row, DATE_COLUMN_END, POSTING_COLUMN_END);
  if (description === '' || amount === '') {
    throw rowError(summary, 'a dated row has no description or no amount', description);
  }
  const { value, credit } = readTableAmount(amount, summary);
  if (value.isZero()) {
    return;
  }
  lines.push({
    transactionDate: dateInPeriod(date, summary),
    postingDate: dateInPeriod(posting, summary),
    description,
    amount: value.toFixed(2),
    direction: credit ? 'credit' : 'debit',
    notes: [],
  });
}

function readTableAmount(text: string, summary: Summary): { value: Decimal; credit: boolean } {
  const match = TABLE_AMOUNT.exec(text);
  if (match === null) {
    throw rowError(summary, 'unreadable amount', text);
  }
  const whole = match[1]!.replace(/,/g, '') || '0';
  return { value: new Decimal(`${whole}.${match[2]!}`), credit: /CR$/.test(text) };
}

function balanceOf(row: Row): Decimal {
  const text = amountText(row);
  const match = TABLE_AMOUNT.exec(text);
  if (match === null) {
    throw new DomainError(`Unreadable balance "${text}"`);
  }
  const value = new Decimal(`${match[1]!.replace(/,/g, '') || '0'}.${match[2]!}`);
  // A balance "CR" means the bank owes you: the card is in credit.
  return /CR$/.test(text) ? value.negated() : value;
}

/**
 * "30-06" on the July 2026 statement is 30 June 2026, and "29-12" on the
 * January 2026 one is 29 December 2025: a line is never AFTER the month
 * its statement closes, so a later month means the year before.
 */
function dateInPeriod(dayMonth: string, summary: Summary): CalendarDate {
  const match = DAY_MONTH.exec(dayMonth);
  if (match === null) {
    throw rowError(summary, 'unreadable date', dayMonth);
  }
  const month = Number(match[2]);
  const year = month > summary.period.month ? summary.period.year - 1 : summary.period.year;
  return calendarDate(`${year}-${match[2]!}-${match[1]!}`);
}

function finish(summary: Summary, opening: Decimal, closing: Decimal, lines: StatementLine[]): CardStatement {
  const expected = lines.reduce(
    (sum, l) => (l.direction === 'debit' ? sum.plus(l.amount) : sum.minus(l.amount)),
    opening,
  );
  if (!expected.equals(closing)) {
    throw new DomainError(
      `The ${periodName(summary)} statement does not add up: opening ${opening.toFixed(2)} plus its lines is ` +
        `${expected.toFixed(2)}, but it closes at ${closing.toFixed(2)}. Nothing was imported.`,
    );
  }
  return { ...summary, openingBalance: opening.toFixed(2), closingBalance: closing.toFixed(2), lines };
}

function rowError(summary: Summary, problem: string, text: string): DomainError {
  return new DomainError(`Cannot read the ${periodName(summary)} statement: ${problem} ("${text}")`);
}

const periodName = (summary: Summary) => `${summary.period.year}-${String(summary.period.month).padStart(2, '0')}`;
