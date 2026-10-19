import type { RawMessageView, ReprocessResult, SmsStatus } from './api/types';

export type SmsTone = 'done' | 'attention' | 'waiting' | 'quiet';

/** What each status means for the user (API.md section 9), in plain words. */
export const SMS_STATUS: Record<SmsStatus, { label: string; explain: string; tone: SmsTone }> = {
  parsed: { label: 'Transaction', explain: 'Became a transaction.', tone: 'done' },
  unparsed: { label: 'Not read', explain: 'The app could not read this message yet.', tone: 'attention' },
  ignored: { label: 'Ignored', explain: 'Not a transaction (a code, an ad or a notice).', tone: 'quiet' },
  awaiting_pair: {
    label: 'Half a transfer',
    explain: 'One side of a transfer between your accounts. Pair it with the other side.',
    tone: 'attention',
  },
  awaiting_statement: {
    label: 'Waiting for statement',
    explain: 'A foreign-currency charge. Its EGP amount arrives with your card statement.',
    tone: 'waiting',
  },
  pending: { label: 'Not processed yet', explain: 'Waiting to be read. Re-read to process it now.', tone: 'waiting' },
};

export type SmsFilter = 'attention' | 'all' | 'parsed' | 'waiting' | 'ignored';

export function matchesFilter(status: SmsStatus, filter: SmsFilter): boolean {
  const tone = SMS_STATUS[status].tone;
  switch (filter) {
    case 'all':
      return true;
    case 'attention':
      return tone === 'attention';
    case 'parsed':
      return tone === 'done';
    case 'waiting':
      return tone === 'waiting';
    case 'ignored':
      return tone === 'quiet';
  }
}

export function countByFilter(messages: readonly RawMessageView[]): Record<SmsFilter, number> {
  const counts: Record<SmsFilter, number> = { attention: 0, all: 0, parsed: 0, waiting: 0, ignored: 0 };
  for (const m of messages) {
    for (const f of Object.keys(counts) as SmsFilter[]) if (matchesFilter(m.status, f)) counts[f]++;
  }
  return counts;
}

export type ReprocessTotals = Omit<ReprocessResult, 'next'>;

/**
 * Re-reads every message that is not a transaction yet. The server does at
 * most 200 per call and returns `next` while more remain (API.md 9).
 * `maxRounds` stops a server that never says it is done.
 */
export async function reprocessAll(
  call: (after: string | undefined) => Promise<ReprocessResult>,
  onProgress?: (totals: ReprocessTotals) => void,
  maxRounds = 100,
): Promise<ReprocessTotals> {
  const totals: ReprocessTotals = { processed: 0, parsed: 0, unparsed: 0, ignored: 0, awaitingPair: 0, awaitingStatement: 0 };
  let after: string | undefined;
  for (let round = 0; round < maxRounds; round++) {
    const r = await call(after);
    totals.processed += r.processed;
    totals.parsed += r.parsed;
    totals.unparsed += r.unparsed;
    totals.ignored += r.ignored;
    totals.awaitingPair += r.awaitingPair;
    totals.awaitingStatement += r.awaitingStatement;
    onProgress?.({ ...totals });
    if (!r.next || r.processed === 0) break;
    after = r.next;
  }
  return totals;
}
