/**
 * One GPS reading in the app's own format.
 * The plugin's Position is converted into this once, in GeolocationService.
 */
export interface PositionFix {
  /** Degrees, -90 (south) to 90 (north). */
  latitude: number;
  /** Degrees, -180 (west) to 180 (east). */
  longitude: number;
  /** Meters. ~68% chance the true position is within this radius. */
  accuracy: number;
  /** Meters above sea level (WGS84 ellipsoid), or null if unavailable. */
  altitude: number | null;
  /** Meters, or null if unavailable. */
  altitudeAccuracy: number | null;
  /** Meters per second, or null if unavailable. */
  speed: number | null;
  /** Degrees clockwise from true north (0–360), or null if unavailable. */
  heading: number | null;
  /** Milliseconds since 1970-01-01 UTC (Unix epoch). */
  timestamp: number;
}

/** The permission situation, from the app's point of view. */
export type LocationPermission =
  | 'unknown' // not checked yet
  | 'prompt' // never asked: we may show the system dialog
  | 'granted' // precise location allowed
  | 'approximate' // only approximate location: place detection won't work
  | 'denied' // user said no, but we may ask again (explain why first)
  | 'blocked'; // Android won't show the dialog anymore: user must use Settings

/** What the GPS side is currently doing. */
export type GpsStatus =
  | 'idle' // not started
  | 'locating' // waiting for the first fix
  | 'tracking' // receiving updates
  | 'services-off' // the phone's Location toggle is off
  | 'error'; // any other failure (message stored separately)
