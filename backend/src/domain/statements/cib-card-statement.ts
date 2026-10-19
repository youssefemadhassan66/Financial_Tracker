import { Decimal } from 'decimal.js';
import { calendarDate, type CalendarDate } from '../calendar-date.js';
import { isCurrency } from '../currency.js';
import { DomainError } from '../errors.js';
import { MAX_INSTALLMENTS } from '../installment.js';
import type { CardStatement, PdfPages, PdfTextRun, StatementInstallment, StatementLine } from './card-statement.js';

/*
 * CIB credit card e-statement layout (x in points from the left edge).
 * One PDF holds several monthly statements, each laid out as:
 *
 *   summary block    label at x≈54, value at x≈180, Arabic label on the right
 *   OPENING BALANCE
 *   one row per line transaction date x≈55 | posting date x≈151 (1pt higher)
 *                    | description x≈250 | amount right-aligned, "CR" = credit
 *   cashback block   undated rows about rewards earned, not money moved
 *   CLOSING BALANCE
 *   installments     one row per plan, in narrow columns with no printed
 *                    headers: name x≈44 (wrapping onto rows of its own) |
 *                    start "dd/mm" | 3 amounts, the last one this month's
 *                    payment | this payment's number | payments in all
 *
 * The table may continue on the next page. A long description wraps onto
 * a row of its own, with no date and no amount. A "00-00" row holds a note
 * about the line above (the original "USD21,60" of a dollar charge).
 * Everything else — terms, loyalty text — is ignored.
 */
const DATE_COLUMN_END = 120;
const POSTING_COLUMN_END = 220;
const DESCRIPTION_COLUMN_END = 480;
const SUMMARY_LABEL_END = 170;
/** A posting date sits about 1pt above its row; rows are ~13pt apart. */
const SAME_ROW = 3;
/** The next row of a wrapped plan name is about 13pt lower. */
const WRAP_GAP = 18;
/**
 * A plan name piece reaching this close to the start-date column filled
 * its line: the bank cut a word there ("TECHNOLO" + "GY"), so the next
 * piece joins without a space.
 */
const CUT_WORD_MARGIN = 20;
/** "11/08": the day an installment plan started. */
const PLAN_START = /^(\d{2})\/(\d{2})$/;
const PAYMENT_COUNT = /^\d{1,3}$/;

const DAY_MONTH = /^(\d{2})-(\d{2})$/;
/** "USD21,60": a comma before the cents, optional dots between thousands. */
const FOREIGN_NOTE = /^([A-Z]{3})\s?(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})$/;
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

type Summary = Omit<CardStatement, 'openingBalance' | 'closingBalance' | 'lines' | 'installments'>;

interface Row {
  /** Runs of this row, left to right. */
  runs: PdfTextRun[];
  y: number;
}

/** The installment plan whose name may still wrap onto the next rows. */
interface WrappingPlan {
  plan: StatementInstallment;
  x: number;
  y: number;
  /** Where the start-date column begins. */
  dateX: number;
  /** Right edge of the last name piece. */
  right: number;
}

/** The statement being read, between OPENING and CLOSING BALANCE. */
interface Table {
  summary: Summary;
  opening: Decimal;
  lines: StatementLine[];
  /** Inside the cashback block that follows the lines. */
  inCashback: boolean;
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
  let table: Table | null = null;
  let wrapping: WrappingPlan | null = null;

  for (const row of pages.flatMap(rowsOf)) {
    if (table === null) {
      if (descriptionOf(row) === 'OPENING BALANCE') {
        table = { summary: completeSummary(summary), opening: balanceOf(row), lines: [], inCashback: false };
        continue;
      }
      // Between a CLOSING BALANCE and the next statement's summary: the
      // installment table of the statement that just closed.
      const closed = statements.at(-1);
      if (closed !== undefined && Object.keys(summary).length === 0) {
        const plan = readInstallmentRow(row, closed);
        if (plan !== null) {
          closed.installments.push(plan.plan);
          wrapping = plan;
          continue;
        }
        if (wrapping !== null && continuesPlanName(row, wrapping)) {
          continue;
        }
      }
      wrapping = null;
      summary = readSummaryRow(row, summary);
      continue;
    }

    if (descriptionOf(row) === 'CLOSING BALANCE') {
      statements.push(finish(table.summary, table.opening, balanceOf(row), table.lines));
      summary = {};
      table = null;
      continue;
    }
    readTableRow(row, table);
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
  return rows.map((r) => ({ runs: r.runs.sort((a, b) => a.x - b.x), y: r.y }));
}

/**
 * A row of the installment table, or null when the row is anything else.
 * Strict: exactly a name, a "dd/mm" start, three amounts and two payment
 * counts. Loyalty and terms text never has that shape.
 */
function readInstallmentRow(row: Row, statement: CardStatement): WrappingPlan | null {
  const texts = row.runs.map((r) => clean(r.text));
  const start = texts.findIndex((t) => PLAN_START.test(t));
  if (start < 1) return null;
  const rest = texts.slice(start + 1);
  if (rest.length !== 5) return null;
  const [, , monthly, numberText, totalText] = rest as [string, string, string, string, string];
  if (!rest.slice(0, 3).every((t) => TABLE_AMOUNT.test(t) && !/CR$/.test(t))) return null;
  if (!PAYMENT_COUNT.test(numberText) || !PAYMENT_COUNT.test(totalText)) return null;
  const number = Number(numberText);
  const total = Number(totalText);
  if (number < 1 || number > total || total > MAX_INSTALLMENTS) return null;
  const { value } = readTableAmount(monthly, statement);
  if (value.isZero()) return null;

  const nameRuns = row.runs.slice(0, start);
  const [, day, month] = PLAN_START.exec(texts[start]!)!;
  return {
    plan: {
      description: clean(nameRuns.map((r) => r.text).join(' ')),
      startDate: dateInPeriod(`${day}-${month}`, statement),
      monthlyAmount: value.toFixed(2),
      number,
      total,
    },
    x: nameRuns[0]!.x,
    y: row.y,
    dateX: row.runs[start]!.x,
    right: nameRuns.at(-1)!.right,
  };
}

/** Adds a wrapped piece of a plan name ("FOR", "TECHNOLO", "GY") to it. */
function continuesPlanName(row: Row, wrapping: WrappingPlan): boolean {
  const [run, ...others] = row.runs;
  if (run === undefined || others.length > 0) return false;
  if (Math.abs(run.x - wrapping.x) > SAME_ROW || row.y - wrapping.y > WRAP_GAP) return false;
  const cutWord = wrapping.right >= wrapping.dateX - CUT_WORD_MARGIN;
  wrapping.plan.description = clean(`${wrapping.plan.description}${cutWord ? '' : ' '}${run.text}`);
  wrapping.y = row.y;
  wrapping.right = run.right;
  return true;
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

function readTableRow(row: Row, table: Table): void {
  const { summary, lines } = table;
  const date = textIn(row, 0, DATE_COLUMN_END);
  const description = descriptionOf(row);
  const amount = amountText(row);
  const previous = lines.at(-1);

  if (date === '00-00') {
    // A note about the line above, e.g. the original dollar amount.
    if (previous === undefined) throw rowError(summary, 'a note row comes before any line', description);
    previous.notes.push(description);
    previous.original ??= foreignAmountOf(description);
    return;
  }

  if (date === '') {
    if (amount === '') {
      // Inside the cashback block a text row belongs to the block (a
      // reference number), not to the last purchase.
      if (table.inCashback) return;
      // A description too long for one row wraps onto the next.
      if (previous === undefined) throw rowError(summary, 'a text row comes before any line', description);
      previous.description = clean(`${previous.description} ${description}`);
      return;
    }
    // The cashback block under the lines ("Test CashBack Mar-26
    // 120.00", "(Cashback will be added to" 0.00): what you EARNED,
    // credited later as a dated line of its own. Information, not money.
    // Anything else with an amount and no date is refused: two lines that
    // lost their dates could cancel out and the balance check would pass.
    const { value } = readTableAmount(amount, summary);
    const isCashback = /cash\s*back/i.test(description);
    if (!isCashback && !(table.inCashback && value.isZero())) {
      throw rowError(summary, 'an amount with no date', `${description} ${amount}`);
    }
    table.inCashback = true;
    return;
  }

  table.inCashback = false;
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
    original: null,
  });
}

/**
 * "USD21,60" -> USD 21.60. Null for any other note, and for a currency
 * this app does not know: the line is still recorded, in EGP as billed.
 */
function foreignAmountOf(note: string): StatementLine['original'] {
  const match = FOREIGN_NOTE.exec(note);
  if (match === null || !isCurrency(match[1]!) || match[1] === 'EGP') {
    return null;
  }
  const amount = new Decimal(`${match[2]!.replace(/\./g, '')}.${match[3]!}`);
  return amount.isZero() ? null : { amount: amount.toFixed(2), currency: match[1] };
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
  return { ...summary, openingBalance: opening.toFixed(2), closingBalance: closing.toFixed(2), lines, installments: [] };
}

function rowError(summary: Summary, problem: string, text: string): DomainError {
  return new DomainError(`Cannot read the ${periodName(summary)} statement: ${problem} ("${text}")`);
}

const periodName = (summary: Summary) => `${summary.period.year}-${String(summary.period.month).padStart(2, '0')}`;
