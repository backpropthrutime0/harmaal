import axios from 'axios';

// Base URL for the Harmaal FastAPI backend
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000',
});

// Request interceptor: attach the bearer token to every request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

/**
 * Where an expired session should be sent back to.
 *
 * Hormaal Group runs more than one product out of this bundle, and they don't
 * share a sign-in page: a session that dies inside the Animal Feed console
 * belongs at `/feed/login`, not the property app's `/login`.
 */
function loginPathFor(pathname: string): string {
  // Exact segment match — a future `/feedback` route is not the feed console.
  const inFeed = pathname === '/feed' || pathname.startsWith('/feed/');
  return inFeed ? '/feed/login' : '/login';
}

// Response interceptor: on 401, clear the session and bounce to login.
// (Skips the auth endpoints so a failed login/2FA shows its own error.)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const url: string = error?.config?.url ?? '';
    const isAuthCall = url.includes('/auth/login') || url.includes('/auth/verify-2fa');
    if (status === 401 && !isAuthCall && localStorage.getItem('token')) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      const target = loginPathFor(window.location.pathname);
      if (window.location.pathname !== target) {
        window.location.assign(target);
      }
    }
    return Promise.reject(error);
  },
);

export default api;
