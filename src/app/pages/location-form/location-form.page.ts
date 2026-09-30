import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { type AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonRange,
  IonSearchbar,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonText,
  IonTextarea,
  IonTitle,
  IonToolbar,
  NavController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { locateOutline, locationOutline } from 'ionicons/icons';

import {
  DEFAULT_RADIUS_M,
  LOCATION_CATEGORIES,
  LOCATION_TYPES,
  type LocationInput,
  type LocationType,
  MAX_RADIUS_M,
  MIN_RADIUS_M,
  type SavedLocation,
} from '../../core/models/location.model';
import type { PlaceSearchResult } from '../../core/models/place.model';
import { GeocodingService } from '../../core/services/geocoding.service';
import { GeolocationService } from '../../core/services/geolocation.service';
import { LocationStore } from '../../core/services/location-store.service';
import { parseCoordinates } from '../../core/utils/geo.utils';
import {
  LocationPickerComponent,
  type MapPoint,
} from '../../shared/components/location-picker/location-picker.component';

/**
 * The coordinates the place will be saved with.
 * accuracy: the GPS accuracy when taken from "my current position"; null when chosen by hand.
 */
interface FormPosition {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

/** Rejects names made only of spaces (Validators.required accepts "   "). */
function notBlank(control: AbstractControl<string>): { blank: true } | null {
  return control.value.trim() ? null : { blank: true };
}

/**
 * Create mode (/locations/new) and edit mode (/locations/:id/edit).
 * The position can come from: the map (tap/drag the pin), a name search, pasted coordinates,
 * or "Use my current position". You don't need to be at the place to save it.
 */
@Component({
  selector: 'app-location-form',
  templateUrl: 'location-form.page.html',
  styleUrls: ['location-form.page.scss'],
  imports: [
    DecimalPipe,
    IonBackButton,
    IonButton,
    IonButtons,
    IonCard,
    IonCardContent,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonItem,
    IonLabel,
    IonList,
    IonNote,
    IonRange,
    IonSearchbar,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonText,
    IonTextarea,
    IonTitle,
    IonToolbar,
    LocationPickerComponent,
    ReactiveFormsModule,
  ],
})
export class LocationFormPage implements OnInit {
  /** Route parameter ":id" (bound automatically thanks to withComponentInputBinding in main.ts). */
  readonly id = input<string>();

  private readonly store = inject(LocationStore);
  private readonly geo = inject(GeolocationService);
  private readonly geocoding = inject(GeocodingService);
  private readonly navController = inject(NavController);
  private readonly toastController = inject(ToastController);

  protected readonly types = LOCATION_TYPES;
  protected readonly categories = LOCATION_CATEGORIES;
  protected readonly minRadius = MIN_RADIUS_M;
  protected readonly maxRadius = MAX_RADIUS_M;

  protected readonly editing = computed(() => this.id() !== undefined);
  protected readonly position = signal<FormPosition | null>(null);
  protected readonly locating = signal(false);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  private existing: SavedLocation | undefined;

  // Search by name
  protected readonly searchQuery = signal('');
  protected readonly searching = signal(false);
  protected readonly searchResults = signal<PlaceSearchResult[]>([]);
  protected readonly searchMessage = signal<string | null>(null);

  // Pasted coordinates
  protected readonly coordinatesText = signal('');
  protected readonly coordinatesError = signal(false);

  /** Where the map looks before a point is chosen: the user's position, else a saved place. */
  protected readonly mapFallbackCenter = computed<MapPoint | null>(() => {
    const fix = this.geo.fix();
    if (fix) {
      return { latitude: fix.latitude, longitude: fix.longitude };
    }
    const saved = this.store.locations().find((l) => l.latitude !== null && l.longitude !== null);
    return saved ? { latitude: saved.latitude!, longitude: saved.longitude! } : null;
  });

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, Validators.maxLength(60), notBlank]],
    description: ['', [Validators.maxLength(300)]],
    category: [LOCATION_CATEGORIES[0]],
    type: ['place' as LocationType],
    radiusM: [DEFAULT_RADIUS_M, [Validators.required, Validators.min(MIN_RADIUS_M), Validators.max(MAX_RADIUS_M)]],
  });

  /** The radius as a signal, so the label, the map circle and the warning update while the slider moves. */
  protected readonly radius = toSignal(this.form.controls.radiusM.valueChanges, {
    initialValue: DEFAULT_RADIUS_M,
  });

  /** Warn when GPS is less accurate than the radius (only for "my current position"). */
  protected readonly accuracyWarning = computed(() => {
    const accuracy = this.position()?.accuracy;
    const radius = this.radius();
    return accuracy != null && accuracy > radius
      ? `GPS accuracy (${Math.round(accuracy)} m) is worse than the radius (${radius} m), so the saved point may be off. ` +
          'Drag the pin to the right spot, or use a bigger radius.'
      : null;
  });

  constructor() {
    addIcons({ locateOutline, locationOutline });
  }

  async ngOnInit(): Promise<void> {
    const id = this.id();
    if (id === undefined) {
      // New place: use the current position only if location is already on.
      // Otherwise the user picks on the map; we never turn GPS on by ourselves.
      const fix = this.geo.fix();
      if (fix) {
        this.position.set({ latitude: fix.latitude, longitude: fix.longitude, accuracy: fix.accuracy });
      }
      return;
    }

    await this.store.load();
    this.existing = this.store.getById(Number(id));
    if (!this.existing) {
      this.errorMessage.set('This place no longer exists.');
      return;
    }
    const { name, description, category, type, radiusM, latitude, longitude } = this.existing;
    this.form.setValue({ name, description, category, type, radiusM: radiusM ?? DEFAULT_RADIUS_M });
    if (latitude !== null && longitude !== null) {
      this.position.set({ latitude, longitude, accuracy: null });
    }
  }

  /** The pin was tapped/dragged on the map. */
  protected onPicked(point: MapPoint): void {
    this.position.set({ ...point, accuracy: null });
  }

  /** "Use my current position": one GPS reading (the user asked for it explicitly). */
  protected async useCurrentPosition(): Promise<void> {
    this.locating.set(true);
    this.errorMessage.set(null);
    let fix = await this.geo.getFreshFix(5_000);
    if (!fix && !this.geo.hasPermission()) {
      await this.geo.requestPermission(); // first time: shows Android's permission dialog
      fix = this.geo.hasPermission() ? await this.geo.getCurrentFix() : null;
    }
    this.locating.set(false);

    if (fix) {
      this.position.set({ latitude: fix.latitude, longitude: fix.longitude, accuracy: fix.accuracy });
    } else {
      this.errorMessage.set(this.geo.errorMessage() ?? 'Could not get your position. Try again.');
    }
  }

  /** Search by name (Nominatim). Only on Search/Enter, never while typing. */
  protected async search(): Promise<void> {
    const query = this.searchQuery().trim();
    if (!query || this.searching()) {
      return;
    }
    this.searching.set(true);
    this.searchMessage.set(null);
    this.searchResults.set([]);
    try {
      const results = await this.geocoding.search(query);
      this.searchResults.set(results);
      if (results.length === 0) {
        this.searchMessage.set('No places found. Try adding the town, e.g. "Jollibee Calasiao".');
      }
    } catch {
      this.searchMessage.set('Search needs internet. You can still tap the map or paste coordinates.');
    } finally {
      this.searching.set(false);
    }
  }

  protected chooseResult(result: PlaceSearchResult): void {
    this.position.set({ latitude: result.latitude, longitude: result.longitude, accuracy: null });
    this.searchResults.set([]);
    // Pre-fill the name if the user hasn't typed one yet.
    if (!this.form.controls.name.value.trim()) {
      this.form.controls.name.setValue(result.name.slice(0, 60));
    }
  }

  /** "Go" next to the coordinates field. */
  protected applyCoordinates(): void {
    const point = parseCoordinates(this.coordinatesText());
    this.coordinatesError.set(point === null);
    if (point) {
      this.position.set({ ...point, accuracy: null });
    }
  }

  protected async save(): Promise<void> {
    const position = this.position();
    if (this.form.invalid || !position) {
      this.form.markAllAsTouched(); // shows the error texts under invalid fields
      if (!position) {
        this.errorMessage.set('Choose where the place is: tap the map, search, or use your current position.');
      }
      return;
    }

    const value = this.form.getRawValue();
    const input: LocationInput = {
      parentId: this.existing?.parentId ?? null, // the parent picker comes in Milestone 7
      name: value.name,
      description: value.description,
      type: value.type,
      category: value.category,
      latitude: position.latitude,
      longitude: position.longitude,
      radiusM: value.radiusM,
    };

    this.saving.set(true);
    this.errorMessage.set(null);
    try {
      const saved = this.existing
        ? await this.store.update(this.existing.id, input)
        : await this.store.create(input);
      await this.showToast(`"${saved.name}" saved`);
      await this.navController.navigateBack(this.existing ? ['/locations', saved.id] : ['/locations']);
    } catch (error) {
      this.errorMessage.set(`Could not save. ${error instanceof Error ? error.message : ''}`.trim());
    } finally {
      this.saving.set(false);
    }
  }

  private async showToast(message: string): Promise<void> {
    const toast = await this.toastController.create({ message, duration: 2000, position: 'bottom' });
    await toast.present();
  }
}
