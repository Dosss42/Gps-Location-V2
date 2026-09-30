/**
 * A human-readable description of a position, from reverse geocoding (OpenStreetMap Nominatim).
 * Every part except fullAddress can be missing, depending on what OpenStreetMap knows.
 */
export interface PlaceName {
  /** A named place right there (shop, school, church…), or null if the nearest thing is just a road. */
  landmark: string | null;
  /** Street name. */
  street: string | null;
  /** Barangay / village / neighborhood. */
  area: string | null;
  /** Town, city or municipality. */
  town: string | null;
  /** Province (OpenStreetMap calls it "state"). */
  province: string | null;
  /** The complete address line as OpenStreetMap formats it. */
  fullAddress: string;
  /** Where we asked from (our GPS fix), used to decide when a new lookup is needed. */
  latitude: number;
  longitude: number;
  /** When the lookup happened (ms since epoch). */
  fetchedAt: number;
}

/** State of the place-name lookup, for the UI. */
export type PlaceLookupStatus =
  | 'idle' // nothing requested yet
  | 'loading'
  | 'found'
  | 'not-found' // OpenStreetMap has no address here (e.g. at sea)
  | 'unavailable'; // no internet or the service failed
