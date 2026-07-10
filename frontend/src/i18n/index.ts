import { useCallback } from 'react';
import { useLangStore } from './store';
import { messages, type MessageKey } from './messages';

export type { Lang } from './store';
export { useLangStore, LANGS, DEFAULT_LANG } from './store';
export type { MessageKey } from './messages';

/** Values allowed for `{placeholder}` interpolation. */
export type TVars = Record<string, string | number>;

function interpolate(template: string, vars?: TVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

/**
 * Translation function hook. Returns `t(key, vars?)` bound to the active
 * language, re-rendering the caller when the language changes. Falls back to
 * English, then to the raw key, if a translation is missing.
 */
export function useT(): (key: MessageKey, vars?: TVars) => string {
  const lang = useLangStore((s) => s.lang);
  return useCallback(
    (key: MessageKey, vars?: TVars) => {
      const entry = messages[key];
      if (!entry) return key;
      return interpolate(entry[lang] ?? entry.en, vars);
    },
    [lang],
  );
}
