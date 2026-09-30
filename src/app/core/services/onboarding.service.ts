import { Injectable } from '@angular/core';

const STORAGE_KEY = 'whereami.onboardingComplete';

/**
 * Remembers whether the user has seen the Get Started screen.
 *
 * Uses localStorage: it survives app restarts, and losing it (e.g. "Clear storage")
 * only means the welcome screen shows once more, which is harmless.
 * Real app data (saved locations, settings) goes into SQLite in Milestone 4.
 */
@Injectable({ providedIn: 'root' })
export class OnboardingService {
  isComplete(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false; // storage unavailable: just show the welcome screen
    }
  }

  complete(): void {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // Storage unavailable: the welcome screen will show again next launch.
    }
  }

  /** Lets the user see the welcome screen again (Settings → "Show welcome screen"). */
  reset(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing stored, nothing to remove.
    }
  }
}
