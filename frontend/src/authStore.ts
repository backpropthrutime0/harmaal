import { create } from 'zustand';

interface AuthState {
  token: string | null;
  setToken: (token: string | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  // Initialize with the token already in localStorage (if any)
  token: localStorage.getItem('token'),
  
  // Method to save/remove token and update global state
  setToken: (token: string | null) => {
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
    set({ token });
  },
}));