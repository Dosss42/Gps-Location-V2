import { Injectable, inject, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { QueueStrategy, TextToSpeech } from '@capacitor-community/text-to-speech';

import { DEFAULT_SPEECH_SETTINGS, type SpeechSettings } from '../models/speech.model';
import { SettingsRepository } from '../repositories/settings.repository';

/** Key of the speech settings (stored as JSON) in the settings table. */
const SETTINGS_KEY = 'speech';
/** Wait this long after the last change before saving (sliders fire many changes per second). */
const SAVE_DELAY_MS = 500;

/**
 * The only place in the app that talks to the Text-to-Speech plugin.
 * Settings are saved in the SQLite `settings` table (Milestone 4).
 */
@Injectable({ providedIn: 'root' })
export class SpeechService {
  private readonly settingsRepository = inject(SettingsRepository);
  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  private readonly _settings = signal<SpeechSettings>(DEFAULT_SPEECH_SETTINGS);
  private readonly _isSpeaking = signal(false);
  private readonly _languages = signal<string[]>([]);
  private readonly _errorMessage = signal<string | null>(null);

  readonly settings = this._settings.asReadonly();
  readonly isSpeaking = this._isSpeaking.asReadonly();
  readonly languages = this._languages.asReadonly();
  readonly errorMessage = this._errorMessage.asReadonly();

  /**
   * Increases with every speak()/stop(). An interrupted speak() call must not touch
   * isSpeaking afterwards: only the call whose number is still current may do that.
   */
  private utteranceNumber = 0;

  /**
   * Speaks the text, interrupting anything currently being spoken.
   * Resolves when the sentence has finished. NOTE: on Android, a sentence that gets
   * interrupted (by stop() or a newer speak()) never resolves, so nothing may wait on it.
   */
  async speak(text: string): Promise<void> {
    const myNumber = ++this.utteranceNumber;
    this._isSpeaking.set(true);
    this._errorMessage.set(null);

    try {
      const { lang, rate, pitch, volume } = this._settings();
      await TextToSpeech.speak({
        text,
        lang,
        rate,
        pitch,
        volume,
        queueStrategy: QueueStrategy.Flush, // newest message wins
      });
    } catch (error) {
      if (myNumber === this.utteranceNumber) {
        this._errorMessage.set(toSpeechErrorMessage(error, this._settings().lang));
      }
    } finally {
      if (myNumber === this.utteranceNumber) {
        this._isSpeaking.set(false);
      }
    }
  }

  /** Stops speaking immediately. */
  async stop(): Promise<void> {
    this.utteranceNumber++; // makes any running speak() call "outdated"
    this._isSpeaking.set(false);
    try {
      await TextToSpeech.stop();
    } catch {
      // Nothing was playing or the engine isn't ready: nothing to stop.
    }
  }

  /** Loads saved settings (at app start). Keeps the defaults if nothing is saved or storage fails. */
  async loadSettings(): Promise<void> {
    try {
      const saved = await this.settingsRepository.get(SETTINGS_KEY);
      if (saved) {
        this._settings.set(parseSpeechSettings(saved));
      }
    } catch {
      // Storage unavailable: the app still works with default settings.
    }
  }

  updateSettings(changes: Partial<SpeechSettings>): void {
    this._settings.update((current) => ({ ...current, ...changes }));
    this.scheduleSave();
  }

  resetSettings(): void {
    this._settings.set(DEFAULT_SPEECH_SETTINGS);
    this.scheduleSave();
  }

  /** "Debounce": restart the timer on every change, so only the final value gets written. */
  private scheduleSave(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.settingsRepository.set(SETTINGS_KEY, JSON.stringify(this._settings())).catch(() => {
        this._errorMessage.set('Your voice settings could not be saved.');
      });
    }, SAVE_DELAY_MS);
  }

  /** Loads the language tags the phone's speech engine supports (e.g. 'en-US', 'fil-PH'). */
  async loadLanguages(): Promise<void> {
    try {
      const { languages } = await TextToSpeech.getSupportedLanguages();
      this._languages.set([...languages].sort());
    } catch (error) {
      this._errorMessage.set(toSpeechErrorMessage(error, this._settings().lang));
    }
  }

  /** Android only: opens the system screen for installing voice data. */
  async openVoiceInstaller(): Promise<void> {
    if (Capacitor.getPlatform() !== 'android') {
      return;
    }
    try {
      await TextToSpeech.openInstall();
    } catch (error) {
      this._errorMessage.set(toSpeechErrorMessage(error, this._settings().lang));
    }
  }
}

/**
 * Reads settings saved as JSON. Anything missing or invalid falls back to the default,
 * so an old or damaged value can never break the app.
 */
export function parseSpeechSettings(json: string): SpeechSettings {
  let saved: Partial<Record<keyof SpeechSettings, unknown>> = {};
  try {
    saved = JSON.parse(json) ?? {};
  } catch {
    return DEFAULT_SPEECH_SETTINGS;
  }
  const numberIn = (value: unknown, min: number, max: number, fallback: number): number =>
    typeof value === 'number' && value >= min && value <= max ? value : fallback;

  return {
    lang: typeof saved.lang === 'string' && saved.lang ? saved.lang : DEFAULT_SPEECH_SETTINGS.lang,
    rate: numberIn(saved.rate, 0.1, 10, DEFAULT_SPEECH_SETTINGS.rate),
    pitch: numberIn(saved.pitch, 0.1, 2, DEFAULT_SPEECH_SETTINGS.pitch),
    volume: numberIn(saved.volume, 0, 1, DEFAULT_SPEECH_SETTINGS.volume),
  };
}

/**
 * The plugin reports errors only as English messages (no error codes),
 * so we match on the message text from its Android source.
 */
function toSpeechErrorMessage(error: unknown, lang: string): string {
  const text = error instanceof Error ? error.message : String(error);

  if (text.includes('language is not supported')) {
    return `The voice for "${lang}" is not installed. Choose another language in Settings, or install the voice.`;
  }
  if (text.includes('Not yet initialized') || text.includes('not available')) {
    return 'The speech engine is still starting or is not installed. Try again in a moment.';
  }
  return `Could not speak: ${text}`;
}
