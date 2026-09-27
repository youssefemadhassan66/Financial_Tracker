import { PiggyBank } from 'lucide-react';
import { cn } from '@/lib/utils';

/** App mark + wordmark. The mark alone is used where space is tight. */
export function Logo({ className, showWordmark = true }: { className?: string; showWordmark?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span
        aria-hidden="true"
        className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground"
      >
        <PiggyBank className="size-4.5" strokeWidth={2.25} />
      </span>
      {showWordmark && <span className="text-[0.95rem] font-semibold tracking-tight">Finance</span>}
    </span>
  );
}
