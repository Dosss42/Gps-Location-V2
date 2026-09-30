import { Injectable, signal } from '@angular/core';
import { CapacitorHttp } from '@capacitor/core';

import type { PlaceLookupStatus, PlaceName, PlaceSearchResult } from '../models/place.model';
import type { PositionFix } from '../models/position.model';
import { calculateDistance } from '../utils/geo.utils';

const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
/** Nominatim's policy: at most 1 request per second, and no search-as-you-type. */
const MIN_SEARCH_INTERVAL_MS = 1_100;

/**
 * Nominatim's usage policy requires apps to identify themselves.
 * (You may add a contact, e.g. "…; contact: you@example.com", if you publish the app.)
 */
const USER_AGENT = 'WhereAmI-StudentApp/0.1 (Ionic Capacitor learning project)';

/** Only look up again after moving this far from the last looked-up point. */
const MIN_MOVE_M = 50;
/** Minimum time between requests after a success (policy: never more than 1 per second). */
const MIN_INTERVAL_MS = 5_000;
/** Wait longer after a failure (probably offline) before trying again. */
const RETRY_AFTER_FAILURE_MS = 30_000;
const TIMEOUT_MS = 8_000;

/** The parts of one Nominatim "search" result (format=jsonv2) that we use. */
export interface NominatimSearchItem {
  name?: string;
  display_name?: string;
  lat?: string;
  lon?: string;
}

/** The parts of Nominatim's "reverse" JSON (format=jsonv2) that we use. */
export interface NominatimReverseResponse {
  error?: string;
  category?: string;
  name?: string;
  display_name?: string;
  address?: Record<string, string | undefined>;
}

/**
 * Turns GPS coordinates into place names using OpenStreetMap Nominatim (needs internet).
 * PRIVACY: each lookup sends the coordinates to nominatim.openstreetmap.org.
 */
@Injectable({ providedIn: 'root' })
export class GeocodingService {
  private readonly _place = signal<PlaceName | null>(null);
  private readonly _status = signal<PlaceLookupStatus>('idle');

  readonly place = this._place.asReadonly();
  readonly status = this._status.asReadonly();

  private inFlight: Promise<PlaceName | null> | null = null;
  private nextAllowedRequestAt = 0;
  private lastSearchAt = 0;

  /**
   * Finds places by name, e.g. "Jollibee Calasiao" (for saving a place without being there).
   * Only called when the user presses Search, never while typing (Nominatim policy).
   * PRIVACY: the search text is sent to nominatim.openstreetmap.org. Throws when offline.
   */
  async search(query: string): Promise<PlaceSearchResult[]> {
    const text = query.trim();
    if (!text) {
      return [];
    }
    const wait = this.lastSearchAt + MIN_SEARCH_INTERVAL_MS - Date.now();
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    this.lastSearchAt = Date.now();

    const response = await CapacitorHttp.get({
      url: NOMINATIM_SEARCH_URL,
      params: { format: 'jsonv2', q: text, limit: '5', 'accept-language': 'en' },
      headers: { 'User-Agent': USER_AGENT },
      connectTimeout: TIMEOUT_MS,
      readTimeout: TIMEOUT_MS,
    });
    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    return toSearchResults(data as NominatimSearchItem[]);
  }

  /**
   * Called for every GPS update. Makes a request only when the user has moved
   * far enough and enough time has passed; otherwise does nothing.
   */
  async updateForFix(fix: PositionFix): Promise<void> {
    if (this.needsLookup(fix)) {
      await this.lookup(fix);
    }
  }

  /** For Speak: the cached place if it's still close enough, otherwise a new lookup (or null). */
  async getPlaceFor(fix: PositionFix): Promise<PlaceName | null> {
    return this.needsLookup(fix) ? this.lookup(fix) : this._place();
  }

  private needsLookup(fix: PositionFix): boolean {
    const place = this._place();
    if (!place) {
      return true;
    }
    return calculateDistance(place.latitude, place.longitude, fix.latitude, fix.longitude) > MIN_MOVE_M;
  }

  private lookup(fix: PositionFix): Promise<PlaceName | null> {
    if (this.inFlight) {
      return this.inFlight; // a request is already running: share its result
    }
    if (Date.now() < this.nextAllowedRequestAt) {
      // Too soon to ask again. We only get here when we've moved away from the
      // stored place, so it no longer describes where we are: don't return it.
      return Promise.resolve(null);
    }
    this.inFlight = this.request(fix).finally(() => (this.inFlight = null));
    return this.inFlight;
  }

  private async request(fix: PositionFix): Promise<PlaceName | null> {
    this._status.set('loading');
    try {
      // CapacitorHttp makes the request natively on Android, which (unlike the WebView's
      // fetch) allows setting our own User-Agent as the Nominatim policy asks.
      const response = await CapacitorHttp.get({
        url: NOMINATIM_REVERSE_URL,
        params: {
          format: 'jsonv2',
          lat: String(fix.latitude),
          lon: String(fix.longitude),
          zoom: '18', // building/street level
          addressdetails: '1',
          'accept-language': 'en',
        },
        headers: { 'User-Agent': USER_AGENT },
        connectTimeout: TIMEOUT_MS,
        readTimeout: TIMEOUT_MS,
      });
      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (typeof response.data === 'string'
        ? JSON.parse(response.data)
        : response.data) as NominatimReverseResponse;

      this.nextAllowedRequestAt = Date.now() + MIN_INTERVAL_MS;
      const place = toPlaceName(data, fix, Date.now());
      this._place.set(place);
      this._status.set(place ? 'found' : 'not-found');
      return place;
    } catch {
      this.nextAllowedRequestAt = Date.now() + RETRY_AFTER_FAILURE_MS;
      // The stored place belongs to a spot we've moved away from (that's why we asked),
      // so clear it rather than keep showing a place name that's no longer true.
      this._place.set(null);
      this._status.set('unavailable');
      return null;
    }
  }
}

/** Converts Nominatim search results; skips any without valid coordinates. */
export function toSearchResults(items: readonly NominatimSearchItem[]): PlaceSearchResult[] {
  const results: PlaceSearchResult[] = [];
  for (const item of items ?? []) {
    const latitude = Number(item.lat);
    const longitude = Number(item.lon);
    if (!item.display_name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      continue;
    }
    results.push({
      name: item.name || item.display_name.split(',')[0],
      address: item.display_name,
      latitude,
      longitude,
    });
  }
  return results;
}

/** Categories where Nominatim's "name" is just the road or region, not a landmark. */
const NON_LANDMARK_CATEGORIES = ['highway', 'place', 'boundary'];

/** Converts Nominatim's response into our PlaceName. Returns null when there's no address. */
export function toPlaceName(
  data: NominatimReverseResponse,
  fix: Pick<PositionFix, 'latitude' | 'longitude'>,
  fetchedAt: number,
): PlaceName | null {
  if (data.error || !data.display_name) {
    return null;
  }
  const address = data.address ?? {};
  const first = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = address[key];
      if (value) {
        return value;
      }
    }
    return null;
  };

  const isLandmark = !!data.name && !NON_LANDMARK_CATEGORIES.includes(data.category ?? '');

  return {
    landmark: isLandmark ? data.name! : null,
    street: first('road', 'pedestrian', 'footway'),
    // Philippine data in OpenStreetMap is inconsistent: the same spot can list several overlapping
    // areas (e.g. quarter "San Miguel", suburb "Nalsian", village "Talibaew"). "quarter" was the
    // most stable across answers in testing, so it goes first. "neighbourhood" (often a sitio) is last.
    area: first('quarter', 'village', 'suburb', 'hamlet', 'neighbourhood'),
    town: first('town', 'city', 'municipality'),
    province: first('state', 'province', 'county'),
    fullAddress: data.display_name,
    latitude: fix.latitude,
    longitude: fix.longitude,
    fetchedAt,
  };
}
