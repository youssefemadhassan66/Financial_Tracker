import type { LucideIcon } from 'lucide-react';
import { FadeIn } from '@/components/motion/fade-in';
import { ScaleIn } from '@/components/motion/scale-in';
import { cn } from '@/lib/utils';

/**
 * Shown when a list or page has nothing yet. It should teach: say what will
 * appear here and, when possible, what the user can do to make it appear.
 */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <FadeIn
      className={cn(
        'flex flex-col items-center rounded-2xl border border-dashed px-6 py-14 text-center',
        className,
      )}
    >
      <ScaleIn
        initialScale={0.9}
        className="mb-4 grid size-11 place-items-center rounded-xl bg-accent text-accent-foreground"
      >
        <Icon className="size-5" />
      </ScaleIn>
      <h2 className="text-base font-semibold">{title}</h2>
      {children && <div className="mt-1.5 max-w-sm text-sm text-muted-foreground text-pretty">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </FadeIn>
  );
}
