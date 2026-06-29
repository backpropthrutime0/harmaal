import api from '../api';
import type { AuthUser } from '../authStore';

export interface LoginResult {
  status: 'ok' | 'mfa_required';
  access_token?: string;
  mfa_token?: string;
  user?: AuthUser;
  must_change_password?: boolean;
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const { data } = await api.post<LoginResult>('/auth/login', { email, password });
  return data;
}

export async function verify2fa(mfaToken: string, code: string): Promise<LoginResult> {
  const { data } = await api.post<LoginResult>('/auth/verify-2fa', { mfa_token: mfaToken, code });
  return data;
}

export async function register(email: string, password: string, role: 'tenant' | 'owner'): Promise<AuthUser> {
  const { data } = await api.post<AuthUser>('/auth/register', { email, password, role });
  return data;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await api.post('/auth/change-password', {
    current_password: currentPassword,
    new_password: newPassword,
  });
}

export interface SetupTotpResult {
  secret: string;
  qr_uri: string;
}

export async function setupTotp(): Promise<SetupTotpResult> {
  const { data } = await api.post<SetupTotpResult>('/auth/setup-totp');
  return data;
}

export async function confirmTotp(code: string): Promise<void> {
  await api.post('/auth/confirm-totp', { code });
}

export async function disableTotp(currentPassword: string): Promise<void> {
  await api.delete('/auth/totp', { data: { current_password: currentPassword } });
}

export async function getMe(): Promise<AuthUser> {
  const { data } = await api.get<AuthUser>('/auth/me');
  return data;
}

/** Extract a human-readable message from an Axios error (FastAPI `detail`). */
export function errorMessage(err: unknown, fallback = 'Something went wrong.'): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const detail = (err as any)?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg as string;
  return fallback;
}
