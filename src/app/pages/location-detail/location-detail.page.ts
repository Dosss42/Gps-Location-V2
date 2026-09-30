import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  AlertController,
  IonBackButton,
  IonBadge,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonTitle,
  IonToolbar,
  NavController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { createOutline, stopCircleOutline, trashOutline, volumeHighOutline } from 'ionicons/icons';

import { LOCATION_TYPES } from '../../core/models/location.model';
import { GeolocationService } from '../../core/services/geolocation.service';
import { LocationStore } from '../../core/services/location-store.service';
import { SpeechService } from '../../core/services/speech.service';
import { buildSavedLocationMessage } from '../../core/utils/announcement.utils';
import { calculateDistance, formatDistance } from '../../core/utils/geo.utils';

@Component({
  selector: 'app-location-detail',
  templateUrl: 'location-detail.page.html',
  styleUrls: ['location-detail.page.scss'],
  imports: [
    DatePipe,
    DecimalPipe,
    IonBackButton,
    IonBadge,
    IonButton,
    IonButtons,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardSubtitle,
    IonCardTitle,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonNote,
    IonTitle,
    IonToolbar,
    RouterLink,
  ],
})
export class LocationDetailPage {
  /** Route parameter ":id". */
  readonly id = input.required<string>();

  private readonly store = inject(LocationStore);
  private readonly geo = inject(GeolocationService);
  protected readonly speech = inject(SpeechService);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);
  private readonly navController = inject(NavController);

  protected readonly formatDistance = formatDistance;

  /** Recomputed automatically when the list changes (e.g. after an edit). undefined = deleted/unknown. */
  protected readonly location = computed(() => this.store.getById(Number(this.id())));

  protected readonly typeLabel = computed(
    () => LOCATION_TYPES.find((type) => type.value === this.location()?.type)?.label ?? '',
  );

  /** Live distance from the user in meters; null without a GPS fix or coordinates. */
  protected readonly distanceM = computed(() => {
    const location = this.location();
    const fix = this.geo.fix();
    if (!location || !fix || location.latitude === null || location.longitude === null) {
      return null;
    }
    return calculateDistance(fix.latitude, fix.longitude, location.latitude, location.longitude);
  });

  /** Is the user within the detection radius? (The core of detection in Milestone 5.) */
  protected readonly isInside = computed(() => {
    const distance = this.distanceM();
    const radius = this.location()?.radiusM;
    return distance !== null && radius != null && distance <= radius;
  });

  constructor() {
    addIcons({ createOutline, stopCircleOutline, trashOutline, volumeHighOutline });
  }

  protected speak(): void {
    const location = this.location();
    if (location) {
      void this.speech.speak(buildSavedLocationMessage(location, this.distanceM()));
    }
  }

  protected async confirmDelete(): Promise<void> {
    const location = this.location();
    if (!location) {
      return;
    }
    const alert = await this.alertController.create({
      header: 'Delete this place?',
      message: `"${location.name}" will be removed from this phone. This can't be undone.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Delete', role: 'destructive', handler: () => void this.delete(location.id, location.name) },
      ],
    });
    await alert.present();
  }

  private async delete(id: number, name: string): Promise<void> {
    try {
      await this.store.delete(id);
      await this.navController.navigateBack('/locations');
      await this.showToast(`"${name}" deleted`);
    } catch {
      await this.showToast('Could not delete this place. Try again.');
    }
  }

  private async showToast(message: string): Promise<void> {
    const toast = await this.toastController.create({ message, duration: 2000, position: 'bottom' });
    await toast.present();
  }
}
