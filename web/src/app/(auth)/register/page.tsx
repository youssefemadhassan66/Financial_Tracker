'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { FormAlert, SubmitButton } from '@/components/auth/auth-form-parts';
import { PasswordInput } from '@/components/auth/password-input';
import { FormField } from '@/components/form-field';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api/errors';
import { toFormErrors } from '@/lib/api/form-errors';
import type { Currency } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

const FIELDS = ['email', 'password', 'defaultCurrency'] as const;

const registerSchema = z.object({
  email: z.email('Enter a valid email address, like name@example.com.').max(254, 'That email is too long.'),
  password: z
    .string()
    .min(12, 'Use at least 12 characters.')
    .max(128, 'Use 128 characters or fewer.'),
  defaultCurrency: z.enum(['EGP', 'USD']),
});

const currencies: { value: Currency; label: string; name: string }[] = [
  { value: 'EGP', label: 'EGP', name: 'Egyptian pound' },
  { value: 'USD', label: 'USD', name: 'US dollar' },
];

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [defaultCurrency, setDefaultCurrency] = React.useState<Currency>('EGP');
  const [pending, setPending] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFieldErrors({});
    setFormError(null);

    const parsed = registerSchema.safeParse({ email: email.trim(), password, defaultCurrency });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]);
        errors[key] ??= issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    setPending(true);
    try {
      await register(parsed.data.email, parsed.data.password, parsed.data.defaultCurrency);
      router.replace('/dashboard');
    } catch (err) {
      const errors = toFormErrors(err, FIELDS);
      if (err instanceof ApiError && err.status === 409) {
        // Show "already registered" next to the email, where the fix is.
        errors.fields.email = 'This email already has an account. Log in instead?';
        errors.general = null;
      }
      setFieldErrors(errors.fields);
      setFormError(errors.general);
      setPending(false);
    }
  }

  const passwordLength = password.length;

  return (
    <div>
      <h1 className="font-heading text-[1.7rem] leading-tight font-semibold tracking-tight">Create your account</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Free, private, and set up in a minute.</p>

      <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-5">
        <FormAlert message={formError} />

        <FormField id="email" label="Email" error={fieldErrors.email}>
          {(control) => (
            <Input
              {...control}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              className="h-11 sm:h-10"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={pending}
            />
          )}
        </FormField>

        <FormField
          id="password"
          label="Password"
          hint="At least 12 characters. A short sentence you’ll remember works well."
          error={fieldErrors.password}
          labelAction={
            passwordLength > 0 && (
              <span
                aria-hidden="true"
                className={cn(
                  'text-xs tabular-nums',
                  passwordLength >= 12 ? 'text-success' : 'text-muted-foreground',
                )}
              >
                {passwordLength}/12
              </span>
            )
          }
        >
          {(control) => (
            <PasswordInput
              {...control}
              name="password"
              autoComplete="new-password"
              className="h-11 sm:h-10"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={pending}
            />
          )}
        </FormField>

        <fieldset className="space-y-2" aria-describedby="currency-hint">
          <legend className="text-sm font-medium">Main currency</legend>
          <div className="grid grid-cols-2 gap-2">
            {currencies.map((c) => (
              <label
                key={c.value}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-lg border bg-card px-3.5 py-2.5 transition-colors',
                  'has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50',
                  defaultCurrency === c.value
                    ? 'border-primary bg-accent text-accent-foreground'
                    : 'hover:bg-muted',
                  pending && 'pointer-events-none opacity-50',
                )}
              >
                <input
                  type="radio"
                  name="defaultCurrency"
                  value={c.value}
                  checked={defaultCurrency === c.value}
                  onChange={() => setDefaultCurrency(c.value)}
                  disabled={pending}
                  className="sr-only"
                />
                <span className="font-semibold">{c.label}</span>
                <span className="truncate text-xs opacity-80">{c.name}</span>
              </label>
            ))}
          </div>
          <p id="currency-hint" className="text-[0.8rem] text-muted-foreground">
            You can still add accounts in the other currency.
          </p>
          {fieldErrors.defaultCurrency && (
            <p className="text-[0.8rem] text-destructive">{fieldErrors.defaultCurrency}</p>
          )}
        </fieldset>

        <SubmitButton pending={pending} pendingLabel="Creating your account…">
          Create account
        </SubmitButton>
      </form>

      <p className="mt-8 text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-accent-foreground underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
