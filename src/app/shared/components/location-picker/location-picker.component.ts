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
  untracked,
  viewChild,
} from '@angular/core';
import * as L from 'leaflet';

/** A point on the map, in degrees. */
export interface MapPoint {
  latitude: number;
  longitude: number;
}

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
/** Where the map starts when there's nothing better: the Philippines. */
const DEFAULT_CENTER: L.LatLngExpression = [12.88, 121.77];
const PLACE_ORANGE = '#ff7a2f';

/**
 * A classic map pin drawn with SVG (Leaflet's default marker images break with modern bundlers).
 * iconAnchor = the pin's tip, so the tip sits exactly on the chosen point.
 */
const PIN_ICON = L.divIcon({
  className: 'location-picker__pin',
  html: `<svg viewBox="0 0 32 42" width="32" height="42" aria-hidden="true">
           <path d="M16 1C7.7 1 1 7.7 1 16c0 11.4 15 25 15 25s15-13.6 15-25C31 7.7 24.3 1 16 1z"
                 fill="${PLACE_ORANGE}" stroke="#fff" stroke-width="2"/>
           <circle cx="16" cy="16" r="5.5" fill="#fff"/>
         </svg>`,
  iconSize: [32, 42],
  iconAnchor: [16, 41],
});

/**
 * Lets the user choose a point: tap the map or drag the pin.
 * Shows the detection radius around the pin. Emits every new point via `positionChange`.
 */
@Component({
  selector: 'app-location-picker',
  template: `<div #mapElement class="location-picker__canvas" role="application"
                  aria-label="Map: tap to place the pin, or drag the pin"></div>`,
  styleUrls: ['location-picker.component.scss'],
  encapsulation: ViewEncapsulation.None, // Leaflet builds its own DOM (see LocationMapComponent)
})
export class LocationPickerComponent {
  /** The chosen point (null = nothing chosen yet). */
  readonly position = input<MapPoint | null>(null);
  /** Detection radius in meters, drawn around the pin. */
  readonly radiusM = input<number>(30);
  /** Where to look when nothing is chosen yet (e.g. the user's last position). */
  readonly fallbackCenter = input<MapPoint | null>(null);
  readonly positionChange = output<MapPoint>();

  private readonly mapElement = viewChild.required<ElementRef<HTMLDivElement>>('mapElement');
  private map: L.Map | null = null;
  private pin: L.Marker | null = null;
  private circle: L.Circle | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    afterNextRender(() => {
      this.createMap();
      this.update(untracked(this.position), untracked(this.radiusM));
    });

    // The parent changed the point (search result, pasted coordinates, "current position")
    // or the radius slider moved: move the pin/circle, and bring the point into view.
    effect(() => {
      const position = this.position();
      const radius = this.radiusM();
      if (this.map) {
        this.update(position, radius);
      }
    });

    inject(DestroyRef).onDestroy(() => {
      this.resizeObserver?.disconnect();
      this.map?.remove();
    });
  }

  private createMap(): void {
    const element = this.mapElement().nativeElement;
    const start = untracked(this.position) ?? untracked(this.fallbackCenter);
    // A Leaflet map needs a view before anything is drawn on it.
    const map = L.map(element).setView(
      start ? [start.latitude, start.longitude] : DEFAULT_CENTER,
      start ? 17 : 5,
    );
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);

    map.on('click', (event: L.LeafletMouseEvent) => this.emit(event.latlng));

    this.resizeObserver = new ResizeObserver(() => map.invalidateSize());
    this.resizeObserver.observe(element);
    this.map = map;
  }

  private update(position: MapPoint | null, radiusM: number): void {
    const map = this.map!;
    if (!position) {
      this.pin?.remove();
      this.circle?.remove();
      this.pin = this.circle = null;
      return;
    }
    const point = L.latLng(position.latitude, position.longitude);

    if (!this.pin || !this.circle) {
      this.circle = L.circle(point, { radius: radiusM, color: PLACE_ORANGE, weight: 2, fillOpacity: 0.15 }).addTo(map);
      this.pin = L.marker(point, { icon: PIN_ICON, draggable: true, autoPan: true })
        .on('dragend', () => this.emit(this.pin!.getLatLng()))
        .addTo(map);
    } else {
      this.pin.setLatLng(point);
      this.circle.setLatLng(point).setRadius(radiusM);
    }

    if (!map.getBounds().contains(point)) {
      map.setView(point, Math.max(map.getZoom(), 17));
    }
  }

  private emit(point: L.LatLng): void {
    // Round to 6 decimals (~0.1 m): more digits would only be noise.
    this.positionChange.emit({
      latitude: Number(point.lat.toFixed(6)),
      longitude: Number(point.lng.toFixed(6)),
    });
  }
}
