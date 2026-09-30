import type { LocationType, SavedLocation } from '../models/location.model';
import type { PositionFix } from '../models/position.model';
import { calculateDistance } from './geo.utils';

/**
 * Tuning knobs for automatic detection. These are starting values: tune them by walking
 * the real campus with the app (see docs/milestones/05-06-detection-and-announcements.md).
 */
export interface DetectionConfig {
  /** Ignore GPS readings less accurate than this (meters): they can't tell which place you're in. */
  maxAccuracyM: number;
  /** Once inside a place, you only "leave" it when farther than radius + this margin (hysteresis). */
  exitMarginM: number;
  /** A change (entering, leaving, switching place) must be seen this many times in a row. */
  requiredConfirmations: number;
  /** Don't announce the same place again within this time (ms), e.g. when walking out and back in. */
  cooldownMs: number;
}

export const DEFAULT_DETECTION_CONFIG: DetectionConfig = {
  maxAccuracyM: 50,
  exitMarginM: 10,
  requiredConfirmations: 2,
  cooldownMs: 60_000,
};

/** What detection remembers between GPS updates. */
export interface DetectionState {
  /** The place the user is in right now (confirmed), or null. */
  currentId: number | null;
  /** The best match of the latest readings, waiting to be confirmed (null = "no place"). */
  pendingId: number | null;
  /** How many readings in a row agreed on pendingId. */
  pendingCount: number;
  /** When each place was last announced (ms since epoch), for the cooldown. */
  lastAnnouncedAt: Readonly<Record<number, number>>;
}

export const INITIAL_DETECTION_STATE: DetectionState = {
  currentId: null,
  pendingId: null,
  pendingCount: 0,
  lastAnnouncedAt: {},
};

export type DetectionEvent =
  | { type: 'entered'; location: SavedLocation; /** false when still in cooldown */ announce: boolean }
  | { type: 'exited'; location: SavedLocation };

export interface DetectionResult {
  state: DetectionState;
  /** Something changed that the app may want to tell the user; null = nothing new. */
  event: DetectionEvent | null;
  /** 'low-accuracy' = this reading was ignored. */
  quality: 'ok' | 'low-accuracy';
}

/** A saved place the user is inside, with the distance to its center. */
export interface Candidate {
  location: SavedLocation;
  distanceM: number;
}

/** More specific types win when places overlap: a room beats its building, a building its campus. */
const TYPE_RANK: Record<LocationType, number> = {
  room: 5,
  floor: 4,
  building: 3,
  place: 2,
  campus: 1,
  area: 0,
};

/**
 * All places whose circle contains the position.
 * The place the user is already in gets a bigger circle (radius + exit margin): that's the
 * hysteresis that stops "in, out, in, out" when standing near the edge.
 */
export function findCandidates(
  fix: Pick<PositionFix, 'latitude' | 'longitude'>,
  locations: readonly SavedLocation[],
  currentId: number | null,
  exitMarginM: number,
): Candidate[] {
  const candidates: Candidate[] = [];
  for (const location of locations) {
    if (location.latitude === null || location.longitude === null || location.radiusM === null) {
      continue; // not GPS-detectable (e.g. a room without coordinates)
    }
    const distanceM = calculateDistance(fix.latitude, fix.longitude, location.latitude, location.longitude);
    const limit = location.radiusM + (location.id === currentId ? exitMarginM : 0);
    if (distanceM <= limit) {
      candidates.push({ location, distanceM });
    }
  }
  return candidates;
}

/**
 * The most specific candidate: highest type rank, then the smallest circle,
 * then the one whose center is relatively closest. Never "the first database row".
 */
export function pickMostSpecific(candidates: readonly Candidate[]): Candidate | null {
  const sorted = [...candidates].sort(
    (a, b) =>
      TYPE_RANK[b.location.type] - TYPE_RANK[a.location.type] ||
      a.location.radiusM! - b.location.radiusM! ||
      a.distanceM / a.location.radiusM! - b.distanceM / b.location.radiusM!,
  );
  return sorted[0] ?? null;
}

/**
 * One step of automatic detection, run for every GPS update.
 * Pure function: same inputs → same result, no side effects. The caller keeps `state`
 * and decides what to do with `event` (speak, vibrate, update the screen).
 */
export function detect(
  fix: PositionFix,
  locations: readonly SavedLocation[],
  previous: DetectionState,
  now: number,
  config: DetectionConfig = DEFAULT_DETECTION_CONFIG,
): DetectionResult {
  // The current place may have been deleted meanwhile: forget it quietly.
  let state = previous;
  if (state.currentId !== null && !locations.some((location) => location.id === state.currentId)) {
    state = { ...state, currentId: null };
  }

  // 1. Accuracy gate: a vague reading must not move us in or out of anything.
  if (fix.accuracy > config.maxAccuracyM) {
    return { state, event: null, quality: 'low-accuracy' };
  }

  // 2 + 3. Candidates (with hysteresis), then the most specific one.
  const best = pickMostSpecific(findCandidates(fix, locations, state.currentId, config.exitMarginM));
  const bestId = best?.location.id ?? null;

  // 4. Confirmation: count how many readings in a row agree.
  const pendingCount = bestId === state.pendingId ? state.pendingCount + 1 : 1;
  state = { ...state, pendingId: bestId, pendingCount };

  if (bestId === state.currentId || pendingCount < config.requiredConfirmations) {
    return { state, event: null, quality: 'ok' };
  }

  // 5. Transition: confirmed change of place.
  const left = locations.find((location) => location.id === state.currentId) ?? null;
  state = { ...state, currentId: bestId };

  if (!best) {
    return { state, event: left ? { type: 'exited', location: left } : null, quality: 'ok' };
  }

  const lastAnnounced = state.lastAnnouncedAt[best.location.id];
  const announce = lastAnnounced === undefined || now - lastAnnounced >= config.cooldownMs;
  if (announce) {
    state = { ...state, lastAnnouncedAt: { ...state.lastAnnouncedAt, [best.location.id]: now } };
  }
  return { state, event: { type: 'entered', location: best.location, announce }, quality: 'ok' };
}
