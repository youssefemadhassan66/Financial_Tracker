'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { FadeIn } from '@/components/motion/fade-in';
import { FormAlert, SubmitButton } from '@/components/auth/auth-form-parts';
import { PasswordInput } from '@/components/auth/password-input';
import { FormField } from '@/components/form-field';
import { Input } from '@/components/ui/input';
import { toFormErrors } from '@/lib/api/form-errors';
import { useAuth } from '@/providers/auth-provider';

const FIELDS = ['email', 'password'] as const;

const loginSchema = z.object({
  email: z.email('Enter a valid email address, like name@example.com.').max(254, 'That email is too long.'),
  password: z.string().min(1, 'Enter your password.'),
});

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFieldErrors({});
    setFormError(null);

    const parsed = loginSchema.safeParse({ email: email.trim(), password });
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
      await login(parsed.data.email, parsed.data.password);
      router.replace('/dashboard');
    } catch (err) {
      const errors = toFormErrors(err, FIELDS, { 401: 'That email and password don’t match. Check them and try again.' });
      setFieldErrors(errors.fields);
      setFormError(errors.general);
      setPending(false);
    }
  }

  return (
    <FadeIn>
      <h1 className="font-heading text-[1.7rem] leading-tight font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Log in to see what your bank sent today.</p>

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

        <FormField id="password" label="Password" error={fieldErrors.password}>
          {(control) => (
            <PasswordInput
              {...control}
              name="password"
              autoComplete="current-password"
              className="h-11 sm:h-10"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={pending}
            />
          )}
        </FormField>

        <SubmitButton pending={pending} pendingLabel="Logging in…">
          Log in
        </SubmitButton>
      </form>

      <p className="mt-8 text-sm text-muted-foreground">
        New here?{' '}
        <Link href="/register" className="font-medium text-accent-foreground underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </FadeIn>
  );
}
