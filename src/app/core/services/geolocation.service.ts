import { Injectable, computed, inject, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
  Geolocation,
  type PermissionStatus,
  type Position,
  type PositionOptions,
} from '@capacitor/geolocation';

import type { GpsStatus, LocationPermission, PositionFix } from '../models/position.model';
import { SettingsRepository } from '../repositories/settings.repository';

/** Continuous updates for the live display (Android-only options are ignored elsewhere). */
const WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 20_000, // a cold GPS start can take longer than the 10 s default
  maximumAge: 0,
  interval: 5_000, // walking ≈ 1.4 m/s → about 7 m between updates
  minimumUpdateInterval: 2_000,
};

/** A single fresh reading, e.g. for the Speak / Save buttons. */
const ONE_SHOT_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 20_000,
  maximumAge: 0,
};

const LOCATION_OFF_MESSAGE =
  "Location is turned off. Turn on Location in your phone's quick settings, then tap Try again.";

/** Plugin error codes (see docs/milestones/02-gps.md, A3) → messages for the user. */
const ERROR_MESSAGES: Record<string, string> = {
  'OS-PLUG-GLOC-0003': 'Location permission was denied.',
  'OS-PLUG-GLOC-0007': LOCATION_OFF_MESSAGE,
  'OS-PLUG-GLOC-0009': LOCATION_OFF_MESSAGE,
  'OS-PLUG-GLOC-0017': LOCATION_OFF_MESSAGE,
  'OS-PLUG-GLOC-0010': 'Still searching for a GPS signal. Move to an open area and wait a moment.',
};

const LOCATION_OFF_CODES = ['OS-PLUG-GLOC-0007', 'OS-PLUG-GLOC-0009', 'OS-PLUG-GLOC-0017'];

/** Settings key: start location automatically when the app opens ("true" / "false"). */
const AUTO_START_KEY = 'autoStartLocation';

/**
 * The only place in the app that talks to the Geolocation plugin.
 * Pages read the signals below and call the public methods; they never import the plugin.
 */
@Injectable({ providedIn: 'root' })
export class GeolocationService {
  // Writable signals stay private so only this service can change the state...
  private readonly _permission = signal<LocationPermission>('unknown');
  private readonly _status = signal<GpsStatus>('idle');
  private readonly _fix = signal<PositionFix | null>(null);
  private readonly _errorMessage = signal<string | null>(null);

  // ...and pages get read-only versions.
  readonly permission = this._permission.asReadonly();
  readonly status = this._status.asReadonly();
  readonly fix = this._fix.asReadonly();
  readonly errorMessage = this._errorMessage.asReadonly();

  readonly hasPermission = computed(
    () => this._permission() === 'granted' || this._permission() === 'approximate',
  );

  private readonly settingsRepository = inject(SettingsRepository);

  /**
   * Did the USER turn location on? Location is off until they tap "Get my location"
   * (or "Tell me where I am"), unless the "start when the app opens" setting is on.
   */
  private readonly _active = signal(false);
  readonly active = this._active.asReadonly();

  /** Settings switch: start location automatically when the app opens (default off). */
  private readonly _autoStart = signal(false);
  readonly autoStart = this._autoStart.asReadonly();

  /** Resolves to the watch ID once the plugin has started the watch; null when not watching. */
  private watchId: Promise<string> | null = null;

  /** Loads the saved "start when the app opens" choice (at app start). */
  async loadSettings(): Promise<void> {
    try {
      this._autoStart.set((await this.settingsRepository.get(AUTO_START_KEY)) === 'true');
    } catch {
      // Storage unavailable: keep the default (off).
    }
  }

  setAutoStart(enabled: boolean): void {
    this._autoStart.set(enabled);
    this.settingsRepository.set(AUTO_START_KEY, String(enabled)).catch(() => {
      // Not saved: still applies until the app restarts.
    });
  }

  /**
   * Turns location ON: check permission, ask if never asked, then start live updates.
   * Safe to call again (e.g. after the user returns from Settings).
   */
  async start(): Promise<void> {
    this._active.set(true);
    let permission = await this.checkPermission();
    if (this._status() === 'services-off') {
      // Don't start a watch while Location is off: Google Play Services would show its
      // "turn on location" dialog, which pauses/resumes the app, which calls start() again → endless loop.
      // The page offers a "Try again" button instead.
      return;
    }
    if (permission === 'prompt') {
      permission = await this.requestPermission();
    }
    if (this.hasPermission()) {
      await this.startWatching();
    }
  }

  /**
   * Turns location on BECAUSE THE USER ASKED (a button or the "Use your location?" question).
   * Like start(), plus: if the phone's Location toggle is off, it starts a watch anyway, which
   * makes Google Play Services show its one-tap "Turn on location?" dialog. That's only OK when
   * the user asked: doing it automatically would pop that dialog up again and again.
   */
  async turnOn(): Promise<void> {
    await this.start();
    if (this._status() === 'services-off') {
      await this.startWatching();
    }
  }

  /**
   * Turns location OFF (the user tapped "Stop location"): stops GPS and forgets the last
   * position, so the screen no longer shows where the user was.
   */
  async stop(): Promise<void> {
    this._active.set(false);
    await this.stopWatching();
    this._fix.set(null);
    this._status.set('idle');
    this._errorMessage.set(null);
  }

  /** Reads the current permission without showing any dialog. */
  async checkPermission(): Promise<LocationPermission> {
    try {
      const status = await Geolocation.checkPermissions();
      this._permission.set(toLocationPermission(status));
      if (this._status() === 'services-off') {
        // The check succeeded, so Location has been turned back on.
        this._status.set('idle');
        this._errorMessage.set(null);
      }
    } catch (error) {
      // checkPermissions() throws when the phone's Location toggle is off.
      this.handleError(error);
    }
    return this._permission();
  }

  /** Shows the system permission dialog (if Android still allows it). */
  async requestPermission(): Promise<LocationPermission> {
    if (!Capacitor.isNativePlatform()) {
      // requestPermissions() doesn't exist on web. Asking for a position
      // makes the browser show its own permission prompt instead.
      await this.getCurrentFix();
      return this.checkPermission();
    }
    try {
      const status = await Geolocation.requestPermissions();
      this._permission.set(toLocationPermission(status));
    } catch (error) {
      this.handleError(error);
    }
    return this._permission();
  }

  /** Gets one fresh position. Returns null (and sets errorMessage) on failure. */
  async getCurrentFix(): Promise<PositionFix | null> {
    try {
      const position = await Geolocation.getCurrentPosition(ONE_SHOT_OPTIONS);
      return this.acceptPosition(position);
    } catch (error) {
      this.handleError(error);
      return null;
    }
  }

  /**
   * Returns the latest fix if it is newer than `maxAgeMs`; otherwise asks for a fresh one.
   * Used by Speak (and later Save) so they don't wait for GPS when a recent reading exists.
   */
  async getFreshFix(maxAgeMs = 10_000): Promise<PositionFix | null> {
    const latest = this._fix();
    if (latest && Date.now() - latest.timestamp <= maxAgeMs) {
      return latest;
    }
    return this.getCurrentFix();
  }

  /** Starts continuous updates. Does nothing if already watching. */
  async startWatching(): Promise<void> {
    if (this.watchId) {
      return;
    }
    // 'locating' means "waiting for the FIRST fix"; if we already have one, keep showing 'tracking'.
    this._status.set(this._fix() ? 'tracking' : 'locating');
    this._errorMessage.set(null);

    this.watchId =Geolocation.watchPosition(WATCH_OPTIONS, (position, error) => {
      if (error) {
        this.handleError(error);
      } else if (position) {
        this.acceptPosition(position);
      }
    });

    try {
      await this.watchId;
    } catch (error) {
      this.watchId = null;
      this.handleError(error);
    }
  }

  /** Stops continuous updates to save battery. */
  async stopWatching(): Promise<void> {
    const pending = this.watchId;
    this.watchId = null;
    if (!pending) {
      return;
    }
    try {
      // Waiting on the promise also covers "stop was called before the watch finished starting".
      await Geolocation.clearWatch({ id: await pending });
    } catch {
      // The watch failed to start or is already gone: nothing left to clean up.
    }
    if (this._status() === 'locating' || this._status() === 'tracking') {
      this._status.set('idle');
    }
  }

  private acceptPosition(position: Position): PositionFix {
    const fix = toPositionFix(position);
    this._fix.set(fix);
    this._status.set('tracking');
    this._errorMessage.set(null);
    return fix;
  }

  private handleError(error: unknown): void {
    const code = getErrorCode(error);

    if (code && LOCATION_OFF_CODES.includes(code)) {
      this._status.set('services-off');
    } else {
      this._status.set('error');
    }
    if (code === 'OS-PLUG-GLOC-0003') {
      // Permission changed (e.g. revoked in Settings): refresh it so the UI shows the right help.
      void this.checkPermission();
    }

    this._errorMessage.set(
      (code && ERROR_MESSAGES[code]) ?? `Could not get your location. ${getErrorText(error)}`,
    );
  }
}

/** Converts the plugin's permission values into the app's LocationPermission. */
export function toLocationPermission(status: PermissionStatus): LocationPermission {
  if (status.location === 'granted') {
    return 'granted';
  }
  if (status.coarseLocation === 'granted') {
    return 'approximate';
  }
  switch (status.location) {
    case 'prompt':
      return 'prompt';
    case 'prompt-with-rationale':
      return 'denied';
    case 'denied':
      return 'blocked';
  }
}

/** Converts the plugin's Position into the app's PositionFix. */
export function toPositionFix(position: Position): PositionFix {
  const { coords } = position;
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: coords.accuracy,
    altitude: coords.altitude ?? null,
    altitudeAccuracy: coords.altitudeAccuracy ?? null,
    speed: coords.speed ?? null,
    heading: coords.heading ?? null,
    timestamp: position.timestamp,
  };
}

/** Native plugin errors carry a string code like 'OS-PLUG-GLOC-0007'. Web errors don't. */
function getErrorCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code;
    return typeof code === 'string' ? code : null;
  }
  return null;
}

function getErrorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}
