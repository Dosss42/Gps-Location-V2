/** Mean Earth radius in meters (IUGG value). */
const EARTH_RADIUS_M = 6_371_008.8;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Distance in meters between two points on Earth, using the Haversine formula.
 *
 * Why not just subtract the coordinates? One degree of longitude is ~111 km at the
 * equator but shrinks to 0 at the poles, so "difference in degrees" isn't a distance.
 * Haversine treats the Earth as a sphere and measures along its surface
 * (accurate to ~0.5%, far better than GPS itself).
 */
export function calculateDistance(
  latitude1: number,
  longitude1: number,
  latitude2: number,
  longitude2: number,
): number {
  const dLat = toRadians(latitude2 - latitude1);
  const dLon = toRadians(longitude2 - longitude1);

  // a = square of half the straight-line (chord) distance between the points, on a unit sphere
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(latitude1)) * Math.cos(toRadians(latitude2)) * Math.sin(dLon / 2) ** 2;

  // c = the angle between the points as seen from Earth's center (radians)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_M * c;
}

/**
 * Reads coordinates typed or pasted by the user, e.g. "16.0120, 120.3570" (as copied from
 * Google Maps) or "16.0120 120.3570". Returns null if it isn't two valid numbers in range.
 */
export function parseCoordinates(text: string): { latitude: number; longitude: number } | null {
  const parts = text.trim().split(/[\s,;]+/).filter(Boolean);
  if (parts.length !== 2) {
    return null;
  }
  const [latitude, longitude] = parts.map(Number);
  const valid =
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180;
  return valid ? { latitude, longitude } : null;
}

/** Short distance for the screen: "12 m" below 1 km, "1.2 km" above. */
export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}
