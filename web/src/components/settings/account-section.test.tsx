import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as clientModule from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { AccountSection } from './account-section';

const logout = vi.fn();
vi.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'test@example.com', defaultCurrency: 'EGP' },
    logout,
  }),
}));

describe('AccountSection', () => {
  let apiFetchSpy: ReturnType<typeof vi.spyOn>;
  const order: string[] = [];

  beforeEach(() => {
    order.length = 0;
    logout.mockReset().mockImplementation(async () => {
      order.push('logout');
    });
    apiFetchSpy = vi.spyOn(clientModule, 'apiFetch').mockImplementation(async <T,>(path: string): Promise<T> => {
      order.push(path);
      return undefined as T;
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows the signed-in email and main currency', () => {
    render(<AccountSection />);
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    expect(screen.getByText('EGP')).toBeInTheDocument();
  });

  it('confirms first, then calls logout-all and only then logs out locally', async () => {
    render(<AccountSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out of all devices' }));
    expect(apiFetchSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Sign out everywhere' }));
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    expect(apiFetchSpy).toHaveBeenCalledWith('/api/auth/logout-all', { method: 'POST' });
    expect(order).toEqual(['/api/auth/logout-all', 'logout']);
  });

  it('stays signed in and says so when logout-all fails', async () => {
    apiFetchSpy.mockRejectedValue(new ApiError(0, 'NETWORK', 'offline'));
    render(<AccountSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out of all devices' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign out everywhere' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t sign out your other devices');
    expect(logout).not.toHaveBeenCalled();
  });
});
