# TypeScript / React conventions (Harmaal)

Frontend stack: **React 19 + TypeScript (strict) + Vite + Tailwind CSS + zustand + axios**. (No Bootstrap, no React Query — adapted from avis_tools.)

## Core
- Strict TypeScript; no `any`. Prefer named exports. React 19 dropped the global `JSX` namespace — type elements as `ReactElement`/`ReactNode`.
- All HTTP goes through `src/api.ts` (attaches the bearer token; redirects to `/login` on 401). Don't create ad-hoc axios instances.
- Auth state lives in `src/authStore.ts` (zustand): `token`, `user`, `setSession`, `clearSession`, `isAuthenticated()`, `hasPermission()`. Persisted to `localStorage` keys `token` and `user`.
- Auth API calls go through `src/auth/authApi.ts`; use `errorMessage(err)` to surface FastAPI `detail`.

## Patterns
- Styling via Tailwind utility classes (match existing slate/blue palette, `rounded-xl`, `shadow-sm`); no inline styles.
- Guard protected routes with `PrivateRoute` (handles auth + `must_change_password` redirect + optional `permission`).
- Login is a 2-step flow (credentials → TOTP when `mfa_required`); handle 401/423/429.
- Functional components with typed props; controlled form state via `useState`.

## Don't
- Don't store secrets beyond the JWT/user the store already manages.
- Don't bypass the interceptors or read `localStorage` tokens directly in components.
