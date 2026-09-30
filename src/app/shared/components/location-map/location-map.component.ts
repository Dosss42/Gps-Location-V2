import {
  Component,
  DestroyRef,
  ElementRef,
  ViewEncapsulation,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { locateOutline } from 'ionicons/icons';
import * as L from 'leaflet';

import type { SavedLocation } from '../../../core/models/location.model';
import type { PositionFix } from '../../../core/models/position.model';

/** OpenStreetMap's standard tiles: free, no API key; attribution is required. Needs internet. */
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const DEFAULT_ZOOM = 17;
const BRAND_BLUE = '#1e88ff';
const PLACE_ORANGE = '#ff7a2f';
const INSIDE_GREEN = '#22b35e';
/** Where the map starts with no position and no saved places. */
const PHILIPPINES_CENTER: L.LatLngExpression = [12.88, 121.77];

/** The area containing all saved places that have coordinates, or null if there are none. */
function boundsOf(places: readonly SavedLocation[]): L.LatLngBounds | null {
  const points = places
    .filter((place) => place.latitude !== null && place.longitude !== null)
    .map((place) => L.latLng(place.latitude!, place.longitude!));
  return points.length > 0 ? L.latLngBounds(points) : null;
}

/**
 * Shows the user's position on an OpenStreetMap map (Leaflet).
 * The map follows the user until they drag it; then a "recenter" button appears.
 */
@Component({
  selector: 'app-location-map',
  templateUrl: 'location-map.component.html',
  styleUrls: ['location-map.component.scss'],
  // Leaflet builds its own DOM elements, which Angular's scoped (encapsulated) styles can't reach.
  encapsulation: ViewEncapsulation.None,
  imports: [IonButton, IonIcon],
})
export class LocationMapComponent {
  /** The position to show. Every new value moves the dot. */
  readonly fix = input<PositionFix | null>(null);
  /** Saved places, drawn as circles the size of their detection radius. */
  readonly places = input<readonly SavedLocation[]>([]);
  /** The place the user is inside right now: drawn in green. */
  readonly highlightedId = input<number | null>(null);
  /** Emits a place's id when its circle is tapped. */
  readonly placeSelected = output<number>();

  protected readonly following = signal(true);

  private readonly mapElement = viewChild.required<ElementRef<HTMLDivElement>>('mapElement');
  private map: L.Map | null = null;
  private dot: L.CircleMarker | null = null;
  private accuracyCircle: L.Circle | null = null;
  private readonly placesLayer = L.layerGroup();
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    addIcons({ locateOutline });

    // Leaflet needs the real <div> in the page, which exists only after the first render.
    afterNextRender(() => {
      this.createMap();
      this.drawPlaces(untracked(this.places), untracked(this.highlightedId));
      const fix = untracked(this.fix);
      if (fix) {
        this.showFix(fix);
      }
    });

    // Redraw the saved places whenever the list or the highlighted place changes.
    effect(() => {
      const places = this.places();
      const highlightedId = this.highlightedId();
      if (this.map) {
        this.drawPlaces(places, highlightedId);
      }
    });

    // Every later fix: move the dot. No fix (location turned off): remove the dot,
    // but keep the map and the saved places visible.
    effect(() => {
      const fix = this.fix();
      if (!this.map) {
        return;
      }
      if (fix) {
        this.showFix(fix);
      } else {
        this.hideFix();
      }
    });

    inject(DestroyRef).onDestroy(() => {
      this.resizeObserver?.disconnect();
      this.map?.remove();
    });
  }

  protected recenter(): void {
    this.following.set(true);
    const fix = this.fix();
    if (fix && this.map) {
      this.map.setView([fix.latitude, fix.longitude], Math.max(this.map.getZoom(), 16));
    }
  }

  private createMap(): void {
    const element = this.mapElement().nativeElement;
    // A map must have a center and zoom BEFORE any shape is added to it, otherwise Leaflet
    // throws "Cannot read properties of undefined (reading 'intersects')".
    // Start at: the current position → else all saved places → else the Philippines.
    // showFix() zooms in on the user when the first fix arrives.
    const fix = untracked(this.fix);
    const map = L.map(element, { zoomControl: true });
    const placeBounds = boundsOf(untracked(this.places));
    if (fix) {
      map.setView([fix.latitude, fix.longitude], DEFAULT_ZOOM);
    } else if (placeBounds) {
      map.fitBounds(placeBounds.pad(0.3), { maxZoom: DEFAULT_ZOOM });
    } else {
      map.setView(PHILIPPINES_CENTER, 5);
    }
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);
    this.placesLayer.addTo(map);

    // The user moved the map by hand: stop following so we don't fight them.
    map.on('dragstart', () => this.following.set(false));

    // Ionic pages animate in and cards resize; Leaflet must be told when its size changes,
    // otherwise it shows grey areas.
    this.resizeObserver = new ResizeObserver(() => map.invalidateSize());
    this.resizeObserver.observe(element);

    this.map = map;
  }

  /** Clears and redraws every saved place: a circle (detection radius) with a name label. */
  private drawPlaces(places: readonly SavedLocation[], highlightedId: number | null): void {
    this.placesLayer.clearLayers();
    for (const place of places) {
      if (place.latitude === null || place.longitude === null || place.radiusM === null) {
        continue;
      }
      const inside = place.id === highlightedId;
      L.circle([place.latitude, place.longitude], {
        radius: place.radiusM,
        color: inside ? INSIDE_GREEN : PLACE_ORANGE,
        weight: 2,
        fillOpacity: inside ? 0.25 : 0.12,
      })
        // Label just below the center, so it doesn't hide the user's dot when standing in the middle.
        .bindTooltip(place.name, {
          permanent: true,
          direction: 'bottom',
          offset: [0, 12],
          className: 'location-map__label',
        })
        .on('click', () => this.placeSelected.emit(place.id))
        .addTo(this.placesLayer);
    }
    // Circles added later are drawn on top: keep the user's dot above the places.
    this.dot?.bringToFront();
  }

  /** Location was turned off: remove the user's dot and accuracy circle. */
  private hideFix(): void {
    this.dot?.remove();
    this.accuracyCircle?.remove();
    this.dot = this.accuracyCircle = null;
    this.following.set(true); // the next fix zooms to the user again
  }

  private showFix(fix: PositionFix): void {
    const map = this.map!;
    const position = L.latLng(fix.latitude, fix.longitude);

    if (!this.dot || !this.accuracyCircle) {
      // First fix: create the accuracy circle and the dot, and zoom in.
      this.accuracyCircle = L.circle(position, {
        radius: fix.accuracy,
        color: BRAND_BLUE,
        weight: 1,
        fillOpacity: 0.12,
      }).addTo(map);
      this.dot = L.circleMarker(position, {
        radius: 8,
        color: '#ffffff',
        weight: 3,
        fillColor: BRAND_BLUE,
        fillOpacity: 1,
      }).addTo(map);
      map.setView(position, DEFAULT_ZOOM);
      return;
    }

    this.dot.setLatLng(position);
    this.accuracyCircle.setLatLng(position).setRadius(fix.accuracy);
    if (untracked(this.following)) {
      map.panTo(position);
    }
  }
}
