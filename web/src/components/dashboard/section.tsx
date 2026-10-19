import Link from 'next/link';
import { ArrowRight, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** A titled dashboard panel. Panels are flat (no nesting), separated by borders. */
export function DashboardSection({
  title,
  description,
  href,
  hrefLabel,
  className,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  href?: string;
  hrefLabel?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const headingId = `section-${title.toLowerCase().replace(/\W+/g, '-')}`;
  return (
    <section aria-labelledby={headingId} className={cn('rounded-2xl border bg-card', className)}>
      <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3 sm:px-6">
        <div>
          <h2 id={headingId} className="font-bold">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {href && (
          <Link
            href={href}
            className="inline-flex shrink-0 items-center gap-1 rounded-md text-sm font-medium text-accent-foreground outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {hrefLabel}
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** Placeholder rows with the same rhythm as the real list. */
export function RowsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-4 px-5 pb-5 sm:px-6" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="size-9 shrink-0 rounded-full bg-muted motion-safe:animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-2/5 rounded bg-muted motion-safe:animate-pulse" />
            <div className="h-3 w-3/5 rounded bg-muted motion-safe:animate-pulse" />
          </div>
          <div className="h-3.5 w-20 rounded bg-muted motion-safe:animate-pulse" />
        </div>
      ))}
    </div>
  );
}

/** A section that failed to load says so in its own space and offers a retry. */
export function SectionError({ onRetry, what }: { onRetry: () => void; what: string }) {
  return (
    <div className="flex flex-col items-start gap-3 px-5 pb-5 text-sm sm:px-6">
      <p className="text-muted-foreground">Couldn’t load {what}. Your data is safe; this is a connection problem.</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RotateCw aria-hidden="true" />
        Try again
      </Button>
    </div>
  );
}
