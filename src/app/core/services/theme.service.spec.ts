import { TestBed } from '@angular/core/testing';

import { ThemeService, isThemePreference } from './theme.service';

// In unit tests window.matchMedia is a stub (src/test-setup.ts) that reports "light" for the system.
describe('ThemeService', () => {
  let theme: ThemeService;
  const html = document.documentElement;

  beforeEach(() => {
    theme = TestBed.inject(ThemeService);
  });

  afterEach(() => html.classList.remove('ion-palette-dark'));

  it('follows the system by default (light here)', () => {
    expect(theme.preference()).toBe('system');
    expect(theme.isDark()).toBe(false);
    expect(html.classList.contains('ion-palette-dark')).toBe(false);
  });

  it('turns dark mode on and off', () => {
    theme.setPreference('dark');
    expect(theme.isDark()).toBe(true);
    expect(html.classList.contains('ion-palette-dark')).toBe(true);

    theme.setPreference('light');
    expect(html.classList.contains('ion-palette-dark')).toBe(false);
  });

  it('toggle() switches to the opposite of what is shown', () => {
    theme.toggle();
    expect(theme.preference()).toBe('dark');
    theme.toggle();
    expect(theme.preference()).toBe('light');
  });

  it('remembers the choice for the next start', async () => {
    theme.setPreference('dark');
    await theme.load(); // reads back from the (in-memory) settings storage
    expect(theme.preference()).toBe('dark');
  });
});

describe('isThemePreference', () => {
  it('accepts only the three known values', () => {
    expect(['system', 'light', 'dark'].every(isThemePreference)).toBe(true);
    expect(isThemePreference('blue')).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });
});
