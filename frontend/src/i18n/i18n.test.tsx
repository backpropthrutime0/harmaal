// @vitest-environment jsdom
/**
 * Tests for the i18n useT() hook and the useLangStore.
 *
 * Coverage:
 *  - Returns Somali translation by default (DEFAULT_LANG = 'so').
 *  - Returns English when language is switched to 'en'.
 *  - Interpolates {placeholder} tokens in both languages.
 *  - Falls back to the English string when the current-language entry is absent
 *    (implicit — covered by the ?? fallback in useT's implementation).
 *  - Returns the raw key string when the message key is entirely missing.
 *  - Re-renders callers when the language changes (hook reactivity).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useLangStore, DEFAULT_LANG } from './store';
import { useT } from './index';

// Reset store + DOM between tests so isolation is tight.
beforeEach(() => {
  localStorage.clear();
  useLangStore.setState({ lang: DEFAULT_LANG }); // back to 'so'
});

afterEach(() => {
  cleanup();
});

describe('useT hook', () => {
  it('returns Somali translation by default (DEFAULT_LANG = so)', () => {
    const { result } = renderHook(() => useT());
    // 'common.cancel' → { en: 'Cancel', so: 'Jooji' }
    expect(result.current('common.cancel')).toBe('Jooji');
  });

  it('returns English translation when language is switched to en', () => {
    act(() => {
      useLangStore.getState().setLang('en');
    });
    const { result } = renderHook(() => useT());
    expect(result.current('common.cancel')).toBe('Cancel');
  });

  it('interpolates a single {placeholder} token in English', () => {
    act(() => {
      useLangStore.getState().setLang('en');
    });
    const { result } = renderHook(() => useT());
    // 'nav.workspace' → { en: '{role} Workspace', so: 'Goobta Shaqada {role}' }
    expect(result.current('nav.workspace', { role: 'Admin' })).toBe('Admin Workspace');
  });

  it('interpolates a single {placeholder} token in Somali', () => {
    const { result } = renderHook(() => useT());
    expect(result.current('nav.workspace', { role: 'Maamuul' })).toBe(
      'Goobta Shaqada Maamuul',
    );
  });

  it('interpolates multiple {placeholder} tokens', () => {
    act(() => {
      useLangStore.getState().setLang('en');
    });
    const { result } = renderHook(() => useT());
    // 'property.unitsTenants' → { en: '{units} units · {tenants} tenants', … }
    expect(result.current('property.unitsTenants', { units: 4, tenants: 2 })).toBe(
      '4 units · 2 tenants',
    );
  });

  it('leaves unmatched {tokens} unchanged when the var is not provided', () => {
    act(() => {
      useLangStore.getState().setLang('en');
    });
    const { result } = renderHook(() => useT());
    // If {role} is not supplied, the raw token should stay in the output.
    expect(result.current('nav.workspace')).toBe('{role} Workspace');
  });

  it('returns the raw key string when the message key does not exist', () => {
    const { result } = renderHook(() => useT());
    // @ts-expect-error — intentionally passing a non-existent key to test fallback
    expect(result.current('this.key.does.not.exist')).toBe('this.key.does.not.exist');
  });

  it('re-renders and delivers the new language when setLang is called', () => {
    const { result } = renderHook(() => useT());
    // Initially Somali
    expect(result.current('common.done')).toBe('Diyaar');

    act(() => {
      useLangStore.getState().setLang('en');
    });
    // Now English
    expect(result.current('common.done')).toBe('Done');

    act(() => {
      useLangStore.getState().setLang('so');
    });
    // Back to Somali
    expect(result.current('common.done')).toBe('Diyaar');
  });
});
