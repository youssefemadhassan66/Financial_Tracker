import { MARK_BUBBLE, MARK_COIN, MARK_STROKE } from '@/lib/brand-mark';
import { cn } from '@/lib/utils';

/** The Masroof mark: a message bubble holding a coin. Inherits its color. */
export function MasroofMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d={MARK_BUBBLE} stroke="currentColor" strokeWidth={MARK_STROKE} strokeLinejoin="round" />
      <circle cx={MARK_COIN.cx} cy={MARK_COIN.cy} r={MARK_COIN.r} fill="currentColor" />
    </svg>
  );
}

/** App mark + wordmark. The mark alone is used where space is tight. */
export function Logo({ className, showWordmark = true }: { className?: string; showWordmark?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span
        aria-hidden="true"
        className="grid size-8 place-items-center rounded-[0.6rem] bg-primary text-primary-foreground"
      >
        <MasroofMark className="size-5" />
      </span>
      {showWordmark && (
        <span className="font-display text-[1.1rem] font-extrabold tracking-[-0.02em]">Masroof</span>
      )}
    </span>
  );
}
