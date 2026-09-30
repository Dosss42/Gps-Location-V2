import { Injectable, computed, inject, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

import { SettingsRepository } from '../repositories/settings.repository';

/** "system" follows the phone's own light/dark setting. */
export type ThemePreference = 'system' | 'light' | 'dark';

const SETTINGS_KEY = 'theme';
/** Ionic's dark palette (dark.class.css, imported in global.scss) applies while <html> has this class. */
const DARK_CLASS = 'ion-palette-dark';

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

/** Light / dark mode: remembers the user's choice and applies it to the whole app. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly settingsRepository = inject(SettingsRepository);

  /** The phone's own setting, kept up to date if the user changes it while the app is open. */
  private readonly systemQuery = window.matchMedia('(prefers-color-scheme: dark)');
  private readonly systemPrefersDark = signal(this.systemQuery.matches);

  private readonly _preference = signal<ThemePreference>('system');
  readonly preference = this._preference.asReadonly();

  /** What's actually shown right now. */
  readonly isDark = computed(
    () => this._preference() === 'dark' || (this._preference() === 'system' && this.systemPrefersDark()),
  );

  constructor() {
    this.systemQuery.addEventListener('change', (event) => {
      this.systemPrefersDark.set(event.matches);
      this.apply();
    });
    this.apply(); // right away, so the first screen already has the right colors
  }

  /** Loads the saved choice (at app start). */
  async load(): Promise<void> {
    try {
      const saved = await this.settingsRepository.get(SETTINGS_KEY);
      if (isThemePreference(saved)) {
        this._preference.set(saved);
      }
    } catch {
      // Storage unavailable: keep following the system.
    }
    this.apply();
  }

  setPreference(preference: ThemePreference): void {
    this._preference.set(preference);
    this.apply();
    this.settingsRepository.set(SETTINGS_KEY, preference).catch(() => {
      // Not saved: the choice still applies until the app restarts.
    });
  }

  /** The home screen's sun/moon button: switch to the opposite of what's shown now. */
  toggle(): void {
    this.setPreference(this.isDark() ? 'light' : 'dark');
  }

  private apply(): void {
    const dark = this.isDark();
    document.documentElement.classList.toggle(DARK_CLASS, dark);

    if (Capacitor.isNativePlatform()) {
      // The Android status bar (clock, battery) must contrast with our header:
      // Style.Dark = light icons for a dark background, Style.Light = dark icons for a light one.
      StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {
        // Not critical: only the status bar icon color.
      });
    }
  }
}
