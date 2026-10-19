import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MobileTabBar, SidebarNav } from './nav';

let currentPathname = '/dashboard';

vi.mock('next/navigation', () => ({
  usePathname: () => currentPathname,
}));

const user = { id: 'user-1', email: 'test@example.com', defaultCurrency: 'EGP' as const };

describe('SidebarNav', () => {
  afterEach(() => cleanup());

  it('marks only the current page with aria-current="page"', () => {
    currentPathname = '/dashboard';
    render(<SidebarNav />);
    expect(screen.getByRole('link', { name: /Dashboard/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Transactions/i })).not.toHaveAttribute('aria-current');
  });
});

describe('MobileTabBar', () => {
  afterEach(() => cleanup());

  function renderBar() {
    return render(<MobileTabBar user={user} logout={vi.fn(async () => {})} />);
  }

  it('shows Home, Activity, Add, Insights and More, with the current tab marked', () => {
    currentPathname = '/transactions';
    renderBar();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/dashboard');
    expect(within(nav).getByRole('link', { name: 'Activity' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
    expect(within(nav).getByRole('link', { name: 'Add a transaction' })).toHaveAttribute('href', '/transactions?add=1');
    expect(within(nav).getByRole('link', { name: 'Insights' })).toHaveAttribute('href', '/analytics');
    expect(within(nav).getByRole('button', { name: 'More' })).toBeInTheDocument();
  });

  it('More lists every page that is not a tab, and log out', async () => {
    currentPathname = '/dashboard';
    renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    const dialog = await screen.findByRole('dialog');
    for (const label of ['Accounts', 'Subscriptions', 'Plans', 'SMS inbox', 'Settings']) {
      expect(within(dialog).getByRole('link', { name: new RegExp(label) })).toBeInTheDocument();
    }
    expect(within(dialog).queryByRole('link', { name: /Dashboard/ })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: /Transactions/ })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Log out' })).toBeInTheDocument();
  });

  it('highlights More when the current page lives inside it', () => {
    currentPathname = '/accounts';
    renderBar();
    const more = screen.getByRole('button', { name: 'More' });
    expect(more.className).toContain('text-foreground');
    expect(screen.getByRole('link', { name: 'Home' }).className).toContain('text-muted-foreground');
  });
});
