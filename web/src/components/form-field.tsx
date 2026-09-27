import { CircleAlert } from 'lucide-react';
import { Label } from '@/components/ui/label';

export interface FieldControlProps {
  id: string;
  'aria-invalid': boolean;
  'aria-describedby'?: string;
}

/**
 * Label + control + hint/error, with the ARIA wiring done once: the control
 * is described by the hint, or by the error when there is one.
 */
export function FormField({
  id,
  label,
  hint,
  error,
  labelAction,
  children,
}: {
  id: string;
  label: string;
  hint?: React.ReactNode;
  error?: string;
  labelAction?: React.ReactNode;
  children: (control: FieldControlProps) => React.ReactNode;
}) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        {labelAction}
      </div>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {error ? (
        <p id={errorId} className="flex items-start gap-1.5 text-[0.8rem] text-destructive">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-[0.8rem] text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
