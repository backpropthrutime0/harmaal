/**
 * Global Vitest setup.
 *
 * Web Storage shim
 * ----------------
 * Node 26 exposes an experimental `localStorage` accessor on `globalThis` that
 * resolves to `undefined` unless the process was started with
 * `--localstorage-file`. Vitest's jsdom environment sees the name already
 * present on the global and so never copies jsdom's working implementation over
 * it — leaving `localStorage` undefined inside tests even though jsdom provides
 * a real one. Anything touching `authStore` or the i18n store then throws on
 * import.
 *
 * Install a spec-shaped in-memory Storage whenever the environment doesn't hand
 * us a usable one. Each test *file* gets its own environment, so this also keeps
 * storage isolated between files.
 */

class MemoryStorage implements Storage {
  #entries = new Map<string, string>();

  get length(): number {
    return this.#entries.size;
  }

  key(index: number): string | null {
    return Array.from(this.#entries.keys())[index] ?? null;
  }

  getItem(key: string): string | null {
    return this.#entries.get(String(key)) ?? null;
  }

  setItem(key: string, value: string): void {
    this.#entries.set(String(key), String(value));
  }

  removeItem(key: string): void {
    this.#entries.delete(String(key));
  }

  clear(): void {
    this.#entries.clear();
  }
}

/** True when the global already provides Web Storage we can actually call. */
function isUsable(name: 'localStorage' | 'sessionStorage'): boolean {
  try {
    const store = (globalThis as unknown as Record<string, Storage | undefined>)[name];
    if (!store) return false;
    // A present-but-broken accessor still needs to survive a round-trip.
    const probe = '__storage_probe__';
    store.setItem(probe, '1');
    store.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  if (!isUsable(name)) {
    Object.defineProperty(globalThis, name, {
      value: new MemoryStorage(),
      writable: true,
      configurable: true,
    });
  }
}
