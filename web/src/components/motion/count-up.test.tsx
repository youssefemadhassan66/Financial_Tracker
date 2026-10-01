import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import * as motionModule from 'motion/react';
import { formatMoney } from '@/lib/format';
import { CountUp } from './count-up';

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof motionModule>();
  return {
    ...actual,
    useReducedMotion: vi.fn(),
  };
});

describe('CountUp', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders exactly formatMoney(final) immediately when reduced motion is true', () => {
    vi.mocked(motionModule.useReducedMotion).mockReturnValue(true);

    const amount = '8450.50';
    const currency = 'EGP';
    const expected = formatMoney(amount, currency);

    const { container } = render(<CountUp amount={amount} currency={currency} />);

    // Screen reader text must be the final formatted money
    const srOnly = container.querySelector('.sr-only');
    expect(srOnly?.textContent).toBe(expected);

    // Visual text must be the final formatted money immediately
    const visual = container.querySelector('[aria-hidden="true"]');
    expect(visual?.textContent).toBe(expected);
  });

  it('always provides the final formatted value to screen readers even during animation', () => {
    vi.mocked(motionModule.useReducedMotion).mockReturnValue(false);

    const amount = '12500.00';
    const currency = 'USD';
    const expected = formatMoney(amount, currency, '+');

    const { container } = render(
      <CountUp amount={amount} currency={currency} sign="+" />
    );

    const srOnly = container.querySelector('.sr-only');
    expect(srOnly?.textContent).toBe(expected);
  });

  it('finishes on the exact final value under React StrictMode (effects run twice in dev)', async () => {
    vi.mocked(motionModule.useReducedMotion).mockReturnValue(false);
    const expected = formatMoney('6251.24', 'EGP');

    const { container } = render(
      <React.StrictMode>
        <CountUp amount="6251.24" currency="EGP" />
      </React.StrictMode>,
    );

    const visual = () => container.querySelector('[aria-hidden="true"]')?.textContent;
    await waitFor(() => expect(visual()).toBe(expected), { timeout: 3000 });
  });
});
