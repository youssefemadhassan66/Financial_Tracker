import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MobileNav, SidebarNav } from './nav';

let currentPathname = '/dashboard';

vi.mock('next/navigation', () => ({
  usePathname: () => currentPathname,
}));

describe('Nav components with layoutId indicator', () => {
  afterEach(() => {
    cleanup();
  });

  it('SidebarNav highlights the active item with aria-current="page"', () => {
    currentPathname = '/dashboard';
    render(<SidebarNav />);

    const dashboardLink = screen.getByRole('link', { name: /Dashboard/i });
    expect(dashboardLink).toHaveAttribute('aria-current', 'page');

    const transactionsLink = screen.getByRole('link', { name: /Transactions/i });
    expect(transactionsLink).not.toHaveAttribute('aria-current');
  });

  it('MobileNav highlights the active item with aria-current="page"', () => {
    currentPathname = '/transactions';
    render(<MobileNav />);

    const transactionsLink = screen.getByRole('link', { name: /Transactions/i });
    expect(transactionsLink).toHaveAttribute('aria-current', 'page');

    const accountsLink = screen.getByRole('link', { name: /Accounts/i });
    expect(accountsLink).not.toHaveAttribute('aria-current');
  });
});
