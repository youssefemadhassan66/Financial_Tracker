import { CircleAlert, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Form-level error, announced to screen readers as soon as it appears. */
export function FormAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive/8 px-3.5 py-3 text-sm text-destructive"
    >
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p>{message}</p>
    </div>
  );
}

/** Full-width primary submit that shows progress and blocks double submits. */
export function SubmitButton({ pending, children, pendingLabel }: { pending: boolean; children: string; pendingLabel: string }) {
  return (
    <Button type="submit" disabled={pending} className="h-11 w-full text-[0.95rem] sm:h-10">
      {pending && <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />}
      {pending ? pendingLabel : children}
    </Button>
  );
}
