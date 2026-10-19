import { apiFetch } from '@/lib/api/client';

/** The bytes of a kept statement PDF (sent with the access token, so no plain link). */
export function fetchStatementPdf(id: string): Promise<Blob> {
  return apiFetch<Blob>(`/api/statement-files/${encodeURIComponent(id)}/content`, { responseType: 'blob' });
}

/** Saves a file the browser already holds, under its own name. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Long enough for the download to start; the URL then stops holding the file.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** 81234 -> "79 KB"; 2_400_000 -> "2.3 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The months a file covers, oldest to newest: "August – September 2026". */
export function describePeriods(periods: readonly string[], format: (period: string) => string): string {
  if (periods.length === 0) return 'No months imported from it';
  const sorted = [...periods].sort();
  const first = sorted[0]!;
  const last = sorted.at(-1)!;
  if (first === last) return format(first);
  const [fy] = first.split('-');
  const [ly] = last.split('-');
  const firstName = format(first);
  return `${fy === ly ? firstName.replace(` ${fy}`, '') : firstName} – ${format(last)}`;
}

/** One sentence about the installment plans an import found, or null when it found none. */
export function describePlans(plans: { added: number; alreadyKnown: number }): string | null {
  if (plans.added === 0 && plans.alreadyKnown === 0) return null;
  if (plans.added === 0) return 'Its installment plans are already in Plans.';
  const what = plans.added === 1 ? 'installment plan' : 'installment plans';
  return `${plans.added} ${what} added to Plans.`;
}
