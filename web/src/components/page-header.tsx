import { cn } from '@/lib/utils';

/** The title block every app page starts with. Actions sit at the end on wide screens. */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="space-y-1.5">
        <h1 className="font-heading text-[1.7rem] leading-tight font-semibold tracking-tight text-balance">{title}</h1>
        {description && <p className="max-w-prose text-sm text-muted-foreground text-pretty">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
