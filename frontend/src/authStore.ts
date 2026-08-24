import { create } from 'zustand';

export interface AuthUser {
  id: number;
  email: string;
  role: string;
  display_name: string | null;
  phone?: string | null;
  is_active: boolean;
  is_system: boolean;
  totp_enabled: boolean;
  must_change_password: boolean;
  is_otp: boolean;
  permissions: string[];
  roles: { id: number; name: string }[];
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  setSession: (token: string, user: AuthUser) => void;
  setToken: (token: string | null) => void; // kept for backward-compat (logout)
  clearSession: () => void;
  isAuthenticated: () => boolean;
  hasPermission: (perm: string) => boolean;
}

function readUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem('user');
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem('token'),
  user: readUser(),

  setSession: (token, user) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    set({ token, user });
  },

  setToken: (token) => {
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
    set({ token, user: token ? get().user : null });
  },

  clearSession: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    set({ token: null, user: null });
  },

  isAuthenticated: () => {
    const token = get().token;
    if (!token) return false;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  },

  hasPermission: (perm) => get().user?.permissions?.includes(perm) ?? false,
}));
