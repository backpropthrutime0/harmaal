import type { ReactElement } from 'react';
import { LANGS, useLangStore, type Lang } from '../i18n';

const SHORT_LABEL: Record<Lang, string> = {
  so: 'SO',
  en: 'EN',
};

/**
 * Compact two-state language toggle (Somali / English). Sits in the app header
 * and persists the choice via the language store (localStorage-backed).
 */
export function LanguageSwitcher(): ReactElement {
  const { lang, setLang } = useLangStore();

  return (
    <div
      role="group"
      aria-label="Language"
      className="flex items-center rounded-xl bg-slate-100 p-0.5 text-xs font-bold"
    >
      {LANGS.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLang(code)}
          aria-pressed={lang === code}
          className={`px-2.5 py-1 rounded-lg transition ${
            lang === code
              ? 'bg-white text-harmaal-blue shadow-sm'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          {SHORT_LABEL[code]}
        </button>
      ))}
    </div>
  );
}
