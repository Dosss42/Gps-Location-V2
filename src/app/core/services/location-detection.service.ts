import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

import type { SavedLocation } from '../models/location.model';
import type { PositionFix } from '../models/position.model';
import { SettingsRepository } from '../repositories/settings.repository';
import { buildAtSavedLocationMessage } from '../utils/announcement.utils';
import {
  DEFAULT_DETECTION_CONFIG,
  type DetectionState,
  INITIAL_DETECTION_STATE,
  detect,
  findCandidates,
  pickMostSpecific,
} from '../utils/detection.utils';
import { GeolocationService } from './geolocation.service';
import { LocationStore } from './location-store.service';
import { SpeechService } from './speech.service';

const AUTO_ANNOUNCE_KEY = 'autoAnnounce';

/**
 * Automatic detection (Milestones 5–6): on every GPS update, finds which saved place the user
 * is in and announces it once when they enter. The rules live in detection.utils.ts (pure and
 * unit-tested); this service only connects them to GPS, saved places, speech and vibration.
 */
@Injectable({ providedIn: 'root' })
export class LocationDetectionService {
  private readonly geo = inject(GeolocationService);
  private readonly store = inject(LocationStore);
  private readonly speech = inject(SpeechService);
  private readonly settingsRepository = inject(SettingsRepository);

  private state: DetectionState = INITIAL_DETECTION_STATE;

  private readonly _current = signal<SavedLocation | null>(null);
  private readonly _autoAnnounce = signal(true);

  /** The saved place the user is in right now (confirmed), or null. */
  readonly current = this._current.asReadonly();
  /** Settings switch: speak automatically when entering a place. */
  readonly autoAnnounce = this._autoAnnounce.asReadonly();

  constructor() {
    // Run once per new GPS reading. The list of places is read "untracked": saving or
    // editing a place must not count as an extra GPS confirmation.
    effect(() => {
      const fix = this.geo.fix();
      if (fix) {
        untracked(() => this.process(fix, this.store.locations()));
      }
    });
  }

  /** Loads the saved on/off choice (at app start). */
  async load(): Promise<void> {
    try {
      const saved = await this.settingsRepository.get(AUTO_ANNOUNCE_KEY);
      if (saved !== null) {
        this._autoAnnounce.set(saved === 'true');
      }
    } catch {
      // Storage unavailable: keep the default (on).
    }
  }

  setAutoAnnounce(enabled: boolean): void {
    this._autoAnnounce.set(enabled);
    this.settingsRepository.set(AUTO_ANNOUNCE_KEY, String(enabled)).catch(() => {
      // Not saved: still applies until the app restarts.
    });
  }

  /**
   * For the "Tell me where I am" button: the confirmed place if there is one; otherwise an
   * immediate match for this reading (no waiting for a second confirmation, the user asked).
   */
  placeFor(fix: PositionFix): SavedLocation | null {
    const confirmed = this._current();
    if (confirmed) {
      return confirmed;
    }
    if (fix.accuracy > DEFAULT_DETECTION_CONFIG.maxAccuracyM) {
      return null;
    }
    return pickMostSpecific(findCandidates(fix, this.store.locations(), null, 0))?.location ?? null;
  }

  /** The parent of a place (e.g. the campus of a building), if it has one. */
  parentOf(location: SavedLocation): SavedLocation | null {
    return location.parentId !== null ? (this.store.getById(location.parentId) ?? null) : null;
  }

  private process(fix: PositionFix, locations: readonly SavedLocation[]): void {
    const result = detect(fix, locations, this.state, Date.now());
    this.state = result.state;
    this._current.set(locations.find((location) => location.id === result.state.currentId) ?? null);

    const event = result.event;
    if (event?.type === 'entered' && event.announce && this._autoAnnounce()) {
      void this.speech.speak(buildAtSavedLocationMessage(event.location, this.parentOf(event.location)));
      void this.vibrate();
    }
  }

  /** A short buzz, so the user notices even with the sound low. */
  private async vibrate(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }
    try {
      await Haptics.impact({ style: ImpactStyle.Heavy });
    } catch {
      // No vibration motor or not allowed: not important.
    }
  }
}
