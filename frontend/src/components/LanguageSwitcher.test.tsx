// @vitest-environment jsdom
/**
 * Tests for the LanguageSwitcher component.
 *
 * Coverage:
 *  - Renders two toggle buttons: SO and EN.
 *  - The SO button is aria-pressed="true" when lang = 'so' (default).
 *  - Clicking EN sets the language to 'en' in the store.
 *  - Clicking EN persists the choice to localStorage under the 'lang' key.
 *  - Clicking SO after EN switches back and persists.
 *  - aria-pressed updates to reflect the active language.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useLangStore, DEFAULT_LANG } from '../i18n/store';

beforeEach(() => {
  localStorage.clear();
  useLangStore.setState({ lang: DEFAULT_LANG }); // reset to 'so'
});

afterEach(() => {
  cleanup();
});

describe('LanguageSwitcher', () => {
  it('renders both SO and EN buttons', () => {
    render(<LanguageSwitcher />);
    expect(screen.getByText('SO')).toBeDefined();
    expect(screen.getByText('EN')).toBeDefined();
  });

  it('SO button is aria-pressed="true" by default', () => {
    useLangStore.setState({ lang: 'so' });
    render(<LanguageSwitcher />);
    expect(screen.getByText('SO').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('EN').getAttribute('aria-pressed')).toBe('false');
  });

  it('EN button is aria-pressed="true" when lang is en', () => {
    act(() => {
      useLangStore.setState({ lang: 'en' });
    });
    render(<LanguageSwitcher />);
    expect(screen.getByText('EN').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('SO').getAttribute('aria-pressed')).toBe('false');
  });

  it('clicking EN switches the store language to en', () => {
    render(<LanguageSwitcher />);
    fireEvent.click(screen.getByText('EN'));
    expect(useLangStore.getState().lang).toBe('en');
  });

  it('clicking EN persists the choice to localStorage', () => {
    render(<LanguageSwitcher />);
    fireEvent.click(screen.getByText('EN'));
    expect(localStorage.getItem('lang')).toBe('en');
  });

  it('clicking EN updates aria-pressed on both buttons', () => {
    render(<LanguageSwitcher />);
    fireEvent.click(screen.getByText('EN'));
    expect(screen.getByText('EN').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('SO').getAttribute('aria-pressed')).toBe('false');
  });

  it('clicking SO after EN switches back to Somali', () => {
    act(() => {
      useLangStore.setState({ lang: 'en' });
    });
    render(<LanguageSwitcher />);
    fireEvent.click(screen.getByText('SO'));
    expect(useLangStore.getState().lang).toBe('so');
  });

  it('clicking SO after EN persists so to localStorage', () => {
    act(() => {
      useLangStore.setState({ lang: 'en' });
    });
    render(<LanguageSwitcher />);
    fireEvent.click(screen.getByText('SO'));
    expect(localStorage.getItem('lang')).toBe('so');
  });

  it('the group has an accessible aria-label', () => {
    render(<LanguageSwitcher />);
    expect(screen.getByRole('group', { name: 'Language' })).toBeDefined();
  });
});
