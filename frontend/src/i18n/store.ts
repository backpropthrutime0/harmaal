import { create } from 'zustand';

/**
 * Supported UI languages. Somali (`so`) is the product default for the
 * Somaliland user base; English (`en`) is the fallback and second option.
 * Both use the Latin script, so no RTL handling is required.
 */
export type Lang = 'so' | 'en';

export const LANGS: Lang[] = ['so', 'en'];
export const DEFAULT_LANG: Lang = 'so';

const STORAGE_KEY = 'lang';

function readLang(): Lang {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'so' || raw === 'en') return raw;
  } catch {
    /* localStorage unavailable (SSR / privacy mode) — fall through to default */
  }
  return DEFAULT_LANG;
}

interface LangState {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

export const useLangStore = create<LangState>((set) => ({
  lang: readLang(),
  setLang: (lang) => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* ignore persistence failures — the in-memory choice still applies */
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
    set({ lang });
  },
}));

// Reflect the initial choice on the <html> element for a11y / browser hints.
if (typeof document !== 'undefined') {
  document.documentElement.lang = readLang();
}
