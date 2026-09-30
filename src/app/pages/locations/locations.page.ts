import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonBackButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { add, locationOutline } from 'ionicons/icons';

import type { SavedLocation } from '../../core/models/location.model';
import { GeolocationService } from '../../core/services/geolocation.service';
import { LocationStore } from '../../core/services/location-store.service';
import { calculateDistance, formatDistance } from '../../core/utils/geo.utils';

interface LocationListItem {
  location: SavedLocation;
  /** Meters from the user, or null (no GPS fix, or the place has no coordinates). */
  distanceM: number | null;
}

@Component({
  selector: 'app-locations',
  templateUrl: 'locations.page.html',
  styleUrls: ['locations.page.scss'],
  imports: [
    IonBackButton,
    IonButtons,
    IonCard,
    IonCardContent,
    IonContent,
    IonFab,
    IonFabButton,
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
export class LocationsPage {
  protected readonly store = inject(LocationStore);
  private readonly geo = inject(GeolocationService);

  protected readonly formatDistance = formatDistance;

  /** Saved places with their live distance; nearest first when we have a GPS fix. */
  protected readonly items = computed<LocationListItem[]>(() => {
    const fix = this.geo.fix();
    const items = this.store.locations().map((location) => ({
      location,
      distanceM:
        fix && location.latitude !== null && location.longitude !== null
          ? calculateDistance(fix.latitude, fix.longitude, location.latitude, location.longitude)
          : null,
    }));
    // Places without a distance go last; otherwise the store's alphabetical order is kept.
    return fix ? items.sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity)) : items;
  });

  constructor() {
    addIcons({ add, locationOutline });
  }
}
