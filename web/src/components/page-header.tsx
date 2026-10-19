import { AccentWord } from '@/components/accent-word';
import { cn } from '@/lib/utils';

/**
 * The title block every app page starts with: a serif title, optionally ending
 * in one highlighted word ("Good *evening*"). Actions sit at the end on wide screens.
 */
export function PageHeader({
  title,
  titleAccent,
  description,
  actions,
  className,
}: {
  title: string;
  titleAccent?: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="space-y-1.5">
        <h1 className="font-display text-[2.1rem] leading-[1.1] tracking-[-0.01em] text-balance sm:text-[2.4rem]">
          {title}
          {titleAccent && (
            <>
              {' '}
              <AccentWord>{titleAccent}</AccentWord>
            </>
          )}
        </h1>
        {description && <p className="max-w-prose text-sm text-muted-foreground text-pretty">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
