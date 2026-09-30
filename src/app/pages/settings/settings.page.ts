import { DecimalPipe, PercentPipe } from '@angular/common';
import { Component, OnInit, computed, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonRange,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToggle,
  IonToolbar,
  NavController,
  type RangeCustomEvent,
  type SegmentCustomEvent,
  type SelectCustomEvent,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { stopCircleOutline, volumeHighOutline } from 'ionicons/icons';

import type { SpeechSettings } from '../../core/models/speech.model';
import { LocationDetectionService } from '../../core/services/location-detection.service';
import { OnboardingService } from '../../core/services/onboarding.service';
import { SpeechService } from '../../core/services/speech.service';
import { ThemeService, isThemePreference } from '../../core/services/theme.service';

/** The three settings controlled by a slider. */
type SliderSetting = keyof Pick<SpeechSettings, 'rate' | 'pitch' | 'volume'>;

const SAMPLE_SENTENCE = 'This is how I will sound. You are currently at Building 1.';

@Component({
  selector: 'app-settings',
  templateUrl: 'settings.page.html',
  styleUrls: ['settings.page.scss'],
  imports: [
    DecimalPipe,
    PercentPipe,
    IonBackButton,
    IonButton,
    IonButtons,
    IonCard,
    IonCardContent,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonListHeader,
    IonNote,
    IonRange,
    IonSegment,
    IonSegmentButton,
    IonSelect,
    IonSelectOption,
    IonTitle,
    IonToggle,
    IonToolbar,
  ],
})
export class SettingsPage implements OnInit {
  protected readonly speech = inject(SpeechService);
  protected readonly theme = inject(ThemeService);
  protected readonly detection = inject(LocationDetectionService);
  private readonly onboarding = inject(OnboardingService);
  private readonly navController = inject(NavController);
  protected readonly isAndroid = Capacitor.getPlatform() === 'android';

  /**
   * Languages for the picker. Always contains the current one, so the picker
   * shows a value even before the list has loaded (or if loading failed).
   */
  protected readonly languageOptions = computed(() => {
    const languages = this.speech.languages();
    const current = this.speech.settings().lang;
    const options = languages.includes(current) ? languages : [current, ...languages];
    // Sort by the readable name ("Filipino…"), not the code ("fil-PH").
    return [...options].sort((a, b) => this.languageLabel(a).localeCompare(this.languageLabel(b)));
  });

  private readonly languageNames = createLanguageNamer();

  constructor() {
    addIcons({ stopCircleOutline, volumeHighOutline });
  }

  async ngOnInit(): Promise<void> {
    if (this.speech.languages().length === 0) {
      await this.speech.loadLanguages();
    }
  }

  /** "fil-PH" → "Filipino (Philippines) · fil-PH" */
  protected languageLabel(tag: string): string {
    const name = this.languageNames(tag);
    return name && name !== tag ? `${name} · ${tag}` : tag;
  }

  protected onThemeChange(event: SegmentCustomEvent): void {
    const value = event.detail.value;
    if (isThemePreference(value)) {
      this.theme.setPreference(value);
    }
  }

  protected onLanguageChange(event: SelectCustomEvent<string>): void {
    this.speech.updateSettings({ lang: event.detail.value });
  }

  /** Called while a slider moves, so the value label updates live. */
  protected onSliderInput(setting: SliderSetting, event: RangeCustomEvent): void {
    const value = event.detail.value;
    if (typeof value === 'number') {
      this.speech.updateSettings({ [setting]: value });
    }
  }

  protected testVoice(): void {
    void this.speech.speak(SAMPLE_SENTENCE);
  }

  /** Shows the Get Started screen again (useful for demos and testing). */
  protected async showWelcome(): Promise<void> {
    this.onboarding.reset();
    await this.navController.navigateRoot('/welcome');
  }
}

/** Uses the browser's built-in Intl API to turn language tags into readable names. */
function createLanguageNamer(): (tag: string) => string | undefined {
  try {
    const names = new Intl.DisplayNames(['en'], { type: 'language' });
    return (tag) => {
      try {
        return names.of(tag);
      } catch {
        return undefined; // malformed tag from the engine: show it as-is
      }
    };
  } catch {
    return () => undefined; // very old WebView without Intl.DisplayNames
  }
}
