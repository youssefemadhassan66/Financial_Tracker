import { apiFetch } from './client';
import { clearAccessToken, setAccessToken } from './token-store';
import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  User,
} from './types';

export async function register(body: RegisterRequest): Promise<AuthResponse> {
  const response = await apiFetch<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body,
  });
  setAccessToken(response.accessToken);
  return response;
}

export async function login(body: LoginRequest): Promise<AuthResponse> {
  const response = await apiFetch<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body,
  });
  setAccessToken(response.accessToken);
  return response;
}

export async function logout(): Promise<void> {
  try {
    await apiFetch<void>('/api/auth/logout', {
      method: 'POST',
    });
  } finally {
    clearAccessToken();
  }
}

export async function getMe(): Promise<{ user: User }> {
  return apiFetch<{ user: User }>('/api/auth/me', {
    method: 'GET',
  });
}
