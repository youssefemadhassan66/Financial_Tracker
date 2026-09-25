import type { CalendarDate } from '../calendar-date.js';
import type { Currency } from '../currency.js';

/**
 * One piece of text on a PDF page, as the PDF reader found it. The
 * reader knows PDFs; the statement parsers only know these, so they can
 * be tested with hand-made pages and no PDF library at all.
 *
 * Coordinates are in PDF points, measured from the TOP-LEFT of the page.
 */
export interface PdfTextRun {
  text: string;
  /** Left and right edge. */
  x: number;
  right: number;
  /** Baseline, from the top of the page. */
  y: number;
}

/** Every page of a PDF, in order, each with its text runs. */
export type PdfPages = readonly (readonly PdfTextRun[])[];

export interface StatementLine {
  /** When you paid, and when the bank booked it (often a few days later). */
  transactionDate: CalendarDate;
  postingDate: CalendarDate;
  description: string;
  /** Decimal string, always positive; `direction` says which way it went. */
  amount: string;
  /** debit = you owe more (a purchase, a fee); credit = less (a payment, a refund). */
  direction: 'debit' | 'credit';
  /** Extra rows the bank printed under this line, e.g. the original "USD21,60". */
  notes: string[];
  /** The foreign amount a note gives, when the charge was in another currency. */
  original: { amount: string; currency: Currency } | null;
}

/** One monthly credit card statement, as the bank printed it. */
export interface CardStatement {
  /** Last 4 digits of the card the statement is for. */
  cardLast4: string;
  /** The month the statement closes, e.g. { year: 2026, month: 7 }. */
  period: { year: number; month: number };
  dueDate: CalendarDate;
  /** Decimal strings. */
  creditLimit: string;
  availableCredit: string;
  totalDue: string;
  minimumDue: string;
  /** Signed decimal strings: negative when the card is in credit. */
  openingBalance: string;
  closingBalance: string;
  lines: StatementLine[];
}
