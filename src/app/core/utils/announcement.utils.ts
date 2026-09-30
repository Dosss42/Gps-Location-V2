import type { SavedLocation } from '../models/location.model';
import type { PlaceName } from '../models/place.model';
import type { PositionFix } from '../models/position.model';

/** Spoken when the Speak button is pressed but no position could be obtained. */
export const NO_LOCATION_MESSAGE =
  "I don't have your location yet. Please wait for the GPS signal and try again.";

/**
 * Rounds a coordinate for speech: 5 decimals (about 1 meter) and no trailing zeros,
 * so the voice says "16.012" instead of "16.01200000001".
 */
export function formatCoordinateForSpeech(value: number): string {
  return String(Number(value.toFixed(5)));
}

/**
 * Message for a position that doesn't match any saved location.
 * Adds an accuracy warning when the fix is worse than `poorAccuracyAbove` meters.
 */
export function buildUnknownLocationMessage(fix: PositionFix, poorAccuracyAbove?: number): string {
  const latitude = formatCoordinateForSpeech(fix.latitude);
  const longitude = formatCoordinateForSpeech(fix.longitude);
  let message =
    'I could not identify this location. ' +
    `Your current coordinates are latitude ${latitude} and longitude ${longitude}.`;

  if (poorAccuracyAbove !== undefined && fix.accuracy > poorAccuracyAbove) {
    message += ` GPS accuracy is low, about ${Math.round(fix.accuracy)} meters.`;
  }
  return message;
}

/**
 * Message when the user is inside a saved place, e.g. "You are currently at Jollibee."
 * With a parent: "You are currently at Building 1, ABC University."
 */
export function buildAtSavedLocationMessage(location: SavedLocation, parent?: SavedLocation | null): string {
  return parent
    ? `You are currently at ${location.name}, ${parent.name}.`
    : `You are currently at ${location.name}.`;
}

/**
 * Message for a saved location the user selected, e.g.
 * "Grocery Store. Latitude 16.012. Longitude 120.357. It is about 40 meters from you."
 * `distanceM` is optional (unknown when there's no GPS fix).
 */
export function buildSavedLocationMessage(location: SavedLocation, distanceM?: number | null): string {
  let message = `${location.name}.`;
  if (location.latitude !== null && location.longitude !== null) {
    message +=
      ` Latitude ${formatCoordinateForSpeech(location.latitude)}.` +
      ` Longitude ${formatCoordinateForSpeech(location.longitude)}.`;
  }
  if (distanceM !== undefined && distanceM !== null) {
    message += ` It is about ${spokenDistance(distanceM)} from you.`;
  }
  return message;
}

/** Distance in words for speech: "40 meters", "1 meter", "1.2 kilometers". */
function spokenDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} kilometers`;
  }
  const rounded = Math.round(meters);
  return rounded === 1 ? '1 meter' : `${rounded} meters`;
}

/**
 * Message for a position with a place name from OpenStreetMap, e.g.
 * "You are near W. A. Jones Street, San Miguel, Calasiao, Pangasinan."
 * Says "near" because both GPS and map data are approximate.
 */
export function buildPlaceMessage(place: PlaceName, fix: PositionFix, poorAccuracyAbove?: number): string {
  const parts = [place.landmark ?? place.street, place.area, place.town, place.province].filter(
    (part, index, all): part is string => !!part && all.indexOf(part) === index, // drop empty + duplicates
  );
  let message = `You are near ${parts.join(', ')}.`;

  if (poorAccuracyAbove !== undefined && fix.accuracy > poorAccuracyAbove) {
    message += ` GPS accuracy is low, about ${Math.round(fix.accuracy)} meters, so this may not be exact.`;
  }
  return message;
}
