import * as React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { CurrencyAnalytics } from '@/lib/api/types';
import { SpendingPanel } from './spending-panel';

const data: CurrencyAnalytics = {
  currency: 'EGP',
  spending: { total: '100.00', previousTotal: '200.00', changePercent: -50, categories: [] },
  investing: { invested: '0.00', withdrawn: '0.00', net: '0.00', count: 0 },
  income: { total: '0.00', count: 0 },
};

describe('SpendingPanel', () => {
  afterEach(() => cleanup());

  it('names the previous period by the month it ends in', () => {
    // All of October (31 days) is compared with 31 Aug - 30 Sep: that is "September".
    render(<SpendingPanel data={data} periodFrom="2026-10-01" previousTo="2026-09-30" />);
    expect(screen.getByText(/less than September/)).toBeInTheDocument();
    expect(screen.queryByText(/August/)).not.toBeInTheDocument();
  });
});
