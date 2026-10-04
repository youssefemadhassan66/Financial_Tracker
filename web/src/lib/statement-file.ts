/** Same cap as the server (API.md section 10), checked first so a big file never uploads. */
export const MAX_STATEMENT_BYTES = 5 * 1024 * 1024;

export type StatementFileCheck = { ok: true } | { ok: false; error: string };

/**
 * A quick check before uploading. The server still verifies the bytes really
 * are a PDF; this only saves the user a pointless upload.
 */
export function checkStatementFile(file: { name: string; type: string; size: number }): StatementFileCheck {
  const looksLikePdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!looksLikePdf) return { ok: false, error: 'Choose the statement as a PDF file.' };
  if (file.size === 0) return { ok: false, error: 'This file is empty. Download the statement again.' };
  if (file.size > MAX_STATEMENT_BYTES) return { ok: false, error: 'This file is over 5 MB. A statement PDF is much smaller.' };
  return { ok: true };
}

/** "2026-09" -> "September 2026". */
export function formatStatementPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

/** One plain sentence about what an import did. */
export function describeImport(r: {
  status: 'imported' | 'already-imported';
  confirmed: number;
  created: number;
  unmatchedPayments: number;
  pricedSms: number;
}): string {
  if (r.status === 'already-imported') return 'Already imported before. Nothing changed.';
  const parts: string[] = [];
  if (r.confirmed > 0) parts.push(`${r.confirmed} matched messages you already had`);
  if (r.created > 0) parts.push(`${r.created} new ${r.created === 1 ? 'transaction' : 'transactions'} added`);
  if (r.pricedSms > 0) parts.push(`${r.pricedSms} foreign ${r.pricedSms === 1 ? 'charge' : 'charges'} got their EGP amount`);
  const summary = parts.length > 0 ? `${parts.join(', ')}.` : 'Imported. No new transactions.';
  if (r.unmatchedPayments > 0) {
    return `${summary} ${r.unmatchedPayments} card ${r.unmatchedPayments === 1 ? 'payment has' : 'payments have'} no matching message yet.`;
  }
  return summary;
}
