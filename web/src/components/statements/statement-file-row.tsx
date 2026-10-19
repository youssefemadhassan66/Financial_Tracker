'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, FileText, LoaderCircle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api/client';
import { toFormErrors } from '@/lib/api/form-errors';
import type { StatementFileDto } from '@/lib/api/types';
import { toCairoDateString } from '@/lib/cairo-date';
import { formatCalendarDay } from '@/lib/format';
import { formatStatementPeriod } from '@/lib/statement-file';
import { describePeriods, formatFileSize } from '@/lib/statement-files';

/** One kept statement PDF: what it covers, open it, or delete the copy. */
export function StatementFileRow({ file, onOpen }: { file: StatementFileDto; onOpen: (file: StatementFileDto) => void }) {
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const remove = async () => {
    setPending(true);
    setError(null);
    try {
      await apiFetch(`/api/statement-files/${encodeURIComponent(file.id)}`, { method: 'DELETE' });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['statement-files'] }),
        queryClient.invalidateQueries({ queryKey: ['statements'] }),
      ]);
      toast.success(`Deleted ${file.fileName}`);
    } catch (err) {
      setError(toFormErrors(err, []).general);
      setPending(false);
    }
  };

  const covers = describePeriods(file.periods, formatStatementPeriod);

  return (
    <div className="px-5 py-4 sm:px-6">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
          <FileText className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{covers}</p>
          <p className="truncate text-sm text-muted-foreground">
            {file.fileName} · {formatFileSize(file.sizeBytes)} · uploaded {formatCalendarDay(toCairoDateString(file.uploadedAt))}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button className="gap-1.5" onClick={() => onOpen(file)} aria-label={`Open ${covers}`}>
            <Eye aria-hidden="true" />
            Open
          </Button>
          {!confirm && (
            <Button variant="ghost" size="icon" onClick={() => setConfirm(true)} aria-label={`Delete ${covers} PDF`}>
              <Trash2 aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
      {confirm && (
        <div role="group" aria-label={`Delete ${covers} PDF`} className="mt-3 rounded-lg border bg-muted/40 px-3.5 py-3">
          <p className="text-sm">
            Delete this PDF? Only the copy of the file goes: the months imported from it and their transactions stay.
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="destructive" size="sm" onClick={() => void remove()} disabled={pending}>
              {pending && <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" />}
              Delete it
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirm(false)} disabled={pending}>
              Keep it
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[0.8rem] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
