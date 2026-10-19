'use client';

import * as React from 'react';
import { Download, LoaderCircle } from 'lucide-react';
import { SectionError } from '@/components/dashboard/section';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useIsAndroidApp } from '@/lib/android-bridge';
import { fetchStatementPdf, saveBlob } from '@/lib/statement-files';

export interface PdfViewerFile {
  id: string;
  fileName: string;
}

type State = { status: 'loading' } | { status: 'ready'; pages: number } | { status: 'error' };

/**
 * Shows a kept statement PDF inside the app, page by page. The pages are
 * drawn with pdf.js (loaded only when a file is opened) because the
 * Android app's WebView has no PDF viewer and cannot open a new tab.
 */
export function PdfViewerSheet({
  file,
  open,
  onOpenChange,
}: {
  file: PdfViewerFile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const inApp = useIsAndroidApp();
  // A state, not a ref: the sheet mounts its content after `open` turns
  // true, and drawing must start once the page area exists.
  const [container, setContainer] = React.useState<HTMLDivElement | null>(null);
  const blobRef = React.useRef<Blob | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  // Each result is tagged with the file and attempt it belongs to, so a new
  // file or a retry shows "loading" without resetting state in the effect.
  const key = file === null ? '' : `${file.id}:${attempt}`;
  const [result, setResult] = React.useState<{ key: string; state: State } | null>(null);
  const state: State = result !== null && result.key === key ? result.state : { status: 'loading' };

  React.useEffect(() => {
    if (!open || file === null || container === null) return;
    let cancelled = false;
    let destroy: (() => void) | null = null;
    const setState = (next: State) => setResult({ key, state: next });

    void (async () => {
      try {
        const blob = await fetchStatementPdf(file.id);
        if (cancelled) return;
        blobRef.current = blob;
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
        const loading = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
        destroy = () => void loading.destroy();
        const doc = await loading.promise;
        if (cancelled) return destroy();

        const width = Math.max(container.clientWidth, 280);
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (width / base.width) * ratio });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = '100%';
          canvas.className = 'rounded-lg border bg-white shadow-sm';
          canvas.setAttribute('role', 'img');
          canvas.setAttribute('aria-label', `Page ${n} of ${doc.numPages}`);
          container.appendChild(canvas);
          await page.render({ canvas, viewport }).promise;
        }
        if (!cancelled) setState({ status: 'ready', pages: doc.numPages });
      } catch {
        if (!cancelled) setState({ status: 'error' });
      }
    })();

    return () => {
      cancelled = true;
      destroy?.();
      container.replaceChildren();
      blobRef.current = null;
    };
  }, [open, file, key, container]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="truncate pe-8">{file?.fileName ?? 'Statement'}</SheetTitle>
          <SheetDescription>
            {state.status === 'ready'
              ? `${state.pages} ${state.pages === 1 ? 'page' : 'pages'}. Only you can open this file.`
              : 'Only you can open this file.'}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-3 px-4 pb-6">
          {!inApp && state.status === 'ready' && file !== null && (
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={() => blobRef.current !== null && saveBlob(blobRef.current, file.fileName)}
            >
              <Download aria-hidden="true" />
              Download
            </Button>
          )}
          {state.status === 'loading' && (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />
              Opening the statement…
            </p>
          )}
          {state.status === 'error' && <SectionError what="this statement" onRetry={() => setAttempt((a) => a + 1)} />}
          <div ref={setContainer} className="space-y-3" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
