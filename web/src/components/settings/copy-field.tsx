'use client';

import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * A read-only value with a Copy button. When the clipboard is not available
 * (an insecure http:// page, or the browser said no) the text is selected and
 * the user is told to copy it by hand.
 */
export function CopyField({
  id,
  label,
  value,
  onCopied,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onCopied?: () => void;
  hint?: React.ReactNode;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [status, setStatus] = React.useState<'idle' | 'copied' | 'manual'>('idle');

  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(value);
      setStatus('copied');
      onCopied?.();
    } catch {
      inputRef.current?.focus();
      inputRef.current?.select();
      setStatus('manual');
    }
  };

  const messageId = `${id}-message`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          id={id}
          readOnly
          value={value}
          autoComplete="off"
          spellCheck={false}
          aria-describedby={status === 'manual' || hint ? messageId : undefined}
          onFocus={(e) => e.currentTarget.select()}
          className="h-11 flex-1 font-mono text-[0.8rem] sm:h-10"
        />
        <Button type="button" variant="outline" onClick={() => void copy()} className="h-11 shrink-0 sm:h-10">
          {status === 'copied' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {status === 'copied' ? 'Copied' : 'Copy'}
        </Button>
      </div>
      {status === 'manual' ? (
        <p id={messageId} role="status" className="text-[0.8rem] text-muted-foreground">
          Copying didn’t work here. The text is selected: press Ctrl+C, or long-press and choose Copy.
        </p>
      ) : hint ? (
        <p id={messageId} className="text-[0.8rem] text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
