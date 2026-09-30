import { DecimalPipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, effect, inject, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { App } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import {
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonContent,
  IonHeader,
  IonIcon,
  IonSpinner,
  IonTitle,
  IonToolbar,
  NavController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addCircleOutline,
  checkmarkCircle,
  listOutline,
  locateOutline,
  location,
  moonOutline,
  settingsOutline,
  stopCircleOutline,
  sunnyOutline,
  volumeHighOutline,
} from 'ionicons/icons';

import { GeocodingService } from '../../core/services/geocoding.service';
import { GeolocationService } from '../../core/services/geolocation.service';
import { LocationDetectionService } from '../../core/services/location-detection.service';
import { LocationStore } from '../../core/services/location-store.service';
import { SpeechService } from '../../core/services/speech.service';
import { ThemeService } from '../../core/services/theme.service';
import {
  NO_LOCATION_MESSAGE,
  buildAtSavedLocationMessage,
  buildPlaceMessage,
  buildUnknownLocationMessage,
} from '../../core/utils/announcement.utils';
import { LocationMapComponent } from '../../shared/components/location-map/location-map.component';

/**
 * Fixes less accurate than this are flagged as "too low".
 * A starting guess: tune it by testing on the real campus. Moves to Settings in Milestone 6.
 */
const ACCEPTABLE_ACCURACY_M = 30;

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [
    DecimalPipe,
    IonButton,
    IonButtons,
    IonCard,
    IonCardContent,
    IonContent,
    IonHeader,
    IonIcon,
    IonSpinner,
    IonTitle,
    IonToolbar,
    LocationMapComponent,
    RouterLink,
  ],
})
export class HomePage implements OnInit, OnDestroy {
  protected readonly geo = inject(GeolocationService);
  protected readonly geocoding = inject(GeocodingService);
  protected readonly speech = inject(SpeechService);
  protected readonly theme = inject(ThemeService);
  protected readonly store = inject(LocationStore);
  protected readonly detection = inject(LocationDetectionService);
  private readonly navController = inject(NavController);
  protected readonly acceptableAccuracy = ACCEPTABLE_ACCURACY_M;

  /** Big title of the place card: the barangay if known, else the town, landmark or street. */
  protected readonly placeTitle = computed(() => {
    const place = this.geocoding.place();
    return place ? (place.area ?? place.town ?? place.landmark ?? place.street ?? 'Unknown place') : '';
  });

  /** One-line status at the bottom of the screen, with a colored dot. */
  protected readonly status = computed((): { text: string; tone: 'ok' | 'warn' | 'bad' } => {
    const permission = this.geo.permission();
    if (permission === 'denied' || permission === 'blocked') {
      return { text: 'Location permission needed', tone: 'bad' };
    }
    switch (this.geo.status()) {
      case 'services-off':
        return { text: 'Location is turned off', tone: 'bad' };
      case 'error':
        return { text: 'Location problem', tone: 'bad' };
      case 'tracking':
        return this.isAccuracyPoor()
          ? { text: 'Location available · low accuracy', tone: 'warn' }
          : { text: 'Location available', tone: 'ok' };
      default:
        return { text: 'Searching for GPS…', tone: 'warn' };
    }
  });

  constructor() {
    // Standalone Ionic: icons used in the template must be registered first.
    addIcons({
      addCircleOutline,
      checkmarkCircle,
      listOutline,
      locateOutline,
      location,
      moonOutline,
      settingsOutline,
      stopCircleOutline,
      sunnyOutline,
      volumeHighOutline,
    });

    // On every GPS update, let the geocoding service decide whether a new place-name
    // lookup is needed (it only asks after moving 50 m, at most every few seconds).
    effect(() => {
      const fix = this.geo.fix();
      if (fix) {
        // untracked: this effect should re-run only when the fix changes,
        // not when the geocoding service updates its own signals.
        untracked(() => void this.geocoding.updateForFix(fix));
      }
    });
  }

  protected readonly isAccuracyPoor = computed(() => {
    const fix = this.geo.fix();
    return fix !== null && fix.accuracy > ACCEPTABLE_ACCURACY_M;
  });

  private appListeners: PluginListenerHandle[] = [];

  async ngOnInit(): Promise<void> {
    // Stop GPS when the app goes to the background (battery), restart when it comes back.
    // Restarting also re-checks permission, which catches changes made in Android Settings.
    this.appListeners = await Promise.all([
      App.addListener('pause', () => void this.geo.stopWatching()),
      App.addListener('resume', () => void this.geo.start()),
    ]);
    await this.geo.start();
  }

  ngOnDestroy(): void {
    this.appListeners.forEach((listener) => void listener.remove());
    void this.geo.stopWatching();
  }

  /** "Allow location" button, shown after the user said no once. */
  protected async allowLocation(): Promise<void> {
    await this.geo.requestPermission();
    if (this.geo.hasPermission()) {
      await this.geo.startWatching();
    }
  }

  /** "Try again" button, shown after an error (e.g. Location was off). */
  protected async tryAgain(): Promise<void> {
    await this.geo.stopWatching();
    await this.geo.start();
    if (this.geo.status() === 'services-off' && this.geo.hasPermission()) {
      // The user tapped the button, so it's fine to let Google Play Services
      // show its one-tap "Turn on location" dialog.
      await this.geo.startWatching();
    }
  }

  /** "Refresh now" button: asks for one fresh reading immediately. */
  protected async refresh(): Promise<void> {
    await this.geo.getCurrentFix();
  }

  /** Opens a saved place (from the "You are at" panel or a circle on the map). */
  protected openPlace(id: number): void {
    void this.navController.navigateForward(['/locations', id]);
  }

  /**
   * "Tell me where I am" button. Order of preference:
   * 1. a saved place you're in ("You are currently at Jollibee.")
   * 2. the OpenStreetMap place name (needs internet)
   * 3. the coordinates (always works)
   */
  protected async speakLocation(): Promise<void> {
    const fix = await this.geo.getFreshFix();
    if (!fix) {
      await this.speech.speak(NO_LOCATION_MESSAGE);
      return;
    }
    const saved = this.detection.placeFor(fix);
    if (saved) {
      await this.speech.speak(buildAtSavedLocationMessage(saved, this.detection.parentOf(saved)));
      return;
    }
    const place = await this.geocoding.getPlaceFor(fix);
    const message = place
      ? buildPlaceMessage(place, fix, ACCEPTABLE_ACCURACY_M)
      : buildUnknownLocationMessage(fix, ACCEPTABLE_ACCURACY_M);
    await this.speech.speak(message);
  }
}
