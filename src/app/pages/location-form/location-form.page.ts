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
  IonList,
  IonNote,
  IonRange,
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
import { locateOutline } from 'ionicons/icons';

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
import { GeolocationService } from '../../core/services/geolocation.service';
import { LocationStore } from '../../core/services/location-store.service';

/** The coordinates the place will be saved with. accuracy is null for an existing place. */
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
 * Create mode (/locations/new): takes the current GPS position.
 * Edit mode (/locations/:id/edit): loads the saved place; the position only changes on request.
 */
@Component({
  selector: 'app-location-form',
  templateUrl: 'location-form.page.html',
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
    IonList,
    IonNote,
    IonRange,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonText,
    IonTextarea,
    IonTitle,
    IonToolbar,
    ReactiveFormsModule,
  ],
})
export class LocationFormPage implements OnInit {
  /** Route parameter ":id" (bound automatically thanks to withComponentInputBinding in main.ts). */
  readonly id = input<string>();

  private readonly store = inject(LocationStore);
  private readonly geo = inject(GeolocationService);
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

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, Validators.maxLength(60), notBlank]],
    description: ['', [Validators.maxLength(300)]],
    category: [LOCATION_CATEGORIES[0]],
    type: ['place' as LocationType],
    radiusM: [DEFAULT_RADIUS_M, [Validators.required, Validators.min(MIN_RADIUS_M), Validators.max(MAX_RADIUS_M)]],
  });

  /** The radius as a signal, so the label and the accuracy warning update while the slider moves. */
  protected readonly radius = toSignal(this.form.controls.radiusM.valueChanges, {
    initialValue: DEFAULT_RADIUS_M,
  });

  /** Warn when GPS is less accurate than the radius: the saved point could be off by more than the circle. */
  protected readonly accuracyWarning = computed(() => {
    const accuracy = this.position()?.accuracy;
    const radius = this.radius();
    return accuracy != null && accuracy > radius
      ? `GPS accuracy (${Math.round(accuracy)} m) is worse than the radius (${radius} m), so the saved point may be off. ` +
          'Wait for better accuracy, move to an open area, or use a bigger radius.'
      : null;
  });

  constructor() {
    addIcons({ locateOutline });
  }

  async ngOnInit(): Promise<void> {
    const id = this.id();
    if (id === undefined) {
      await this.useCurrentPosition();
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

  /** Takes the GPS position (a reading up to 5 s old is fine). */
  protected async useCurrentPosition(): Promise<void> {
    this.locating.set(true);
    this.errorMessage.set(null);
    const fix = await this.geo.getFreshFix(5_000);
    this.locating.set(false);

    if (fix) {
      this.position.set({ latitude: fix.latitude, longitude: fix.longitude, accuracy: fix.accuracy });
    } else {
      this.errorMessage.set(this.geo.errorMessage() ?? 'Could not get your position. Try again.');
    }
  }

  protected async save(): Promise<void> {
    const position = this.position();
    if (this.form.invalid || !position) {
      this.form.markAllAsTouched(); // shows the error texts under invalid fields
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
