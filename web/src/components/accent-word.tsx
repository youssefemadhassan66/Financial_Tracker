import { cn } from '@/lib/utils';

/**
 * The one highlighted word or phrase of a big title ("Good *afternoon*"),
 * in the accent color. Use once per title, at most.
 */
export function AccentWord({ children, className }: { children: React.ReactNode; className?: string }) {
  return <em className={cn('font-display not-italic text-accent-foreground', className)}>{children}</em>;
}
