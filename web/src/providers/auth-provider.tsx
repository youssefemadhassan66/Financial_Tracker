'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import * as auth from '@/lib/api/auth';
import { setAuthFailureHandler } from '@/lib/api/client';
import { refreshAccessToken } from '@/lib/api/refresh';
import type { Currency, User } from '@/lib/api/types';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthContextType {
  status: AuthStatus;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    defaultCurrency?: Currency
  ) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<AuthStatus>('loading');
  const [user, setUser] = React.useState<User | null>(null);
  const router = useRouter();
  const queryClient = useQueryClient();

  const routerRef = React.useRef(router);
  const queryClientRef = React.useRef(queryClient);

  React.useEffect(() => {
    routerRef.current = router;
    queryClientRef.current = queryClient;
  });

  React.useEffect(() => {
    let isMounted = true;

    setAuthFailureHandler(() => {
      setStatus('unauthenticated');
      setUser(null);
      queryClientRef.current.clear();
      routerRef.current.replace('/login');
    });

    async function initAuth() {
      try {
        const token = await refreshAccessToken();
        if (!isMounted) return;

        if (!token) {
          setUser(null);
          setStatus('unauthenticated');
          return;
        }

        const me = await auth.getMe();
        if (!isMounted) return;

        setUser(me.user);
        setStatus('authenticated');
      } catch {
        if (!isMounted) return;
        setUser(null);
        setStatus('unauthenticated');
      }
    }

    void initAuth();

    return () => {
      isMounted = false;
      setAuthFailureHandler(null);
    };
  }, []);

  const login = React.useCallback(
    async (email: string, password: string) => {
      const res = await auth.login({ email, password });
      setUser(res.user);
      setStatus('authenticated');
    },
    []
  );

  const register = React.useCallback(
    async (
      email: string,
      password: string,
      defaultCurrency?: Currency
    ) => {
      const res = await auth.register({ email, password, defaultCurrency });
      setUser(res.user);
      setStatus('authenticated');
    },
    []
  );

  const logout = React.useCallback(async () => {
    try {
      await auth.logout();
    } finally {
      queryClientRef.current.clear();
      setUser(null);
      setStatus('unauthenticated');
      routerRef.current.replace('/login');
    }
  }, []);

  const contextValue = React.useMemo<AuthContextType>(
    () => ({
      status,
      user,
      login,
      register,
      logout,
    }),
    [status, user, login, register, logout]
  );

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
