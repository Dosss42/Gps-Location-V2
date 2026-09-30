import type { SavedLocation } from '../models/location.model';
import type { PositionFix } from '../models/position.model';
import {
  type DetectionConfig,
  type DetectionResult,
  type DetectionState,
  INITIAL_DETECTION_STATE,
  detect,
  findCandidates,
  pickMostSpecific,
} from './detection.utils';

// ~111,195 m per degree of latitude: lets tests place points a given number of meters north.
const METERS_PER_DEGREE = 111_195;
const BASE = { latitude: 16.012, longitude: 120.357 };

function place(id: number, overrides: Partial<SavedLocation> = {}): SavedLocation {
  return {
    id,
    parentId: null,
    name: `Place ${id}`,
    description: '',
    type: 'place',
    category: '',
    latitude: BASE.latitude,
    longitude: BASE.longitude,
    radiusM: 30,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

/** A GPS reading `metersNorth` meters north of BASE. */
function fixAt(metersNorth: number, accuracy = 5): PositionFix {
  return {
    latitude: BASE.latitude + metersNorth / METERS_PER_DEGREE,
    longitude: BASE.longitude,
    accuracy,
    altitude: null,
    altitudeAccuracy: null,
    speed: null,
    heading: null,
    timestamp: 0,
  };
}

const CONFIG: DetectionConfig = { maxAccuracyM: 50, exitMarginM: 10, requiredConfirmations: 2, cooldownMs: 60_000 };

/** Runs detect() for a series of readings; returns every result. */
function walk(
  distances: number[],
  locations: SavedLocation[],
  start: DetectionState = INITIAL_DETECTION_STATE,
  startTime = 0,
  stepMs = 5_000,
): DetectionResult[] {
  const results: DetectionResult[] = [];
  let state = start;
  distances.forEach((meters, index) => {
    const result = detect(fixAt(meters), locations, state, startTime + index * stepMs, CONFIG);
    results.push(result);
    state = result.state;
  });
  return results;
}

describe('findCandidates / pickMostSpecific', () => {
  it('finds places whose circle contains the position', () => {
    const inside = place(1);
    const far = place(2, { latitude: BASE.latitude + 0.01 }); // ~1.1 km away
    expect(findCandidates(fixAt(10), [inside, far], null, 10).map((c) => c.location.id)).toEqual([1]);
  });

  it('skips places without coordinates', () => {
    expect(findCandidates(fixAt(0), [place(1, { latitude: null, longitude: null, radiusM: null })], null, 10)).toEqual([]);
  });

  it('prefers the building over the campus that contains it (overlapping circles)', () => {
    const campus = place(1, { type: 'campus', radiusM: 200 });
    const building = place(2, { type: 'building', radiusM: 30 });
    const best = pickMostSpecific(findCandidates(fixAt(5), [campus, building], null, 10));
    expect(best?.location.id).toBe(2);
  });

  it('with equal types, prefers the smaller circle', () => {
    const big = place(1, { radiusM: 100 });
    const small = place(2, { radiusM: 40 });
    expect(pickMostSpecific(findCandidates(fixAt(0), [big, small], null, 10))?.location.id).toBe(2);
  });
});

describe('detect', () => {
  const jollibee = place(1, { name: 'Jollibee' });

  it('announces a place only after 2 agreeing readings', () => {
    const [first, second] = walk([0, 0], [jollibee]);
    expect(first.event).toBeNull();
    expect(second.event).toEqual({ type: 'entered', location: jollibee, announce: true });
  });

  it('does NOT repeat while the user stays inside', () => {
    const results = walk([0, 0, 0, 0, 0, 0], [jollibee]);
    expect(results.filter((r) => r.event?.type === 'entered')).toHaveLength(1);
  });

  it('ignores one wild reading (confirmation)', () => {
    const results = walk([0, 0, 200, 0, 0], [jollibee]);
    expect(results.every((r) => r.event?.type !== 'exited')).toBe(true);
  });

  it('stays inside when drifting just past the edge (hysteresis: 30 m radius + 10 m margin)', () => {
    const results = walk([0, 0, 35, 38, 33, 36], [jollibee]);
    expect(results.at(-1)?.state.currentId).toBe(1);
    expect(results.some((r) => r.event?.type === 'exited')).toBe(false);
  });

  it('reports leaving after 2 readings clearly outside', () => {
    const results = walk([0, 0, 60, 60], [jollibee]);
    expect(results[3].event).toEqual({ type: 'exited', location: jollibee });
    expect(results[3].state.currentId).toBeNull();
  });

  it('does not announce again when coming back within the cooldown', () => {
    // in, in (announce) → out, out → in, in (20 s later: still in cooldown)
    const results = walk([0, 0, 60, 60, 0, 0], [jollibee]);
    expect(results[5].event).toEqual({ type: 'entered', location: jollibee, announce: false });
  });

  it('announces again after the cooldown', () => {
    const results = walk([0, 0, 60, 60, 0, 0], [jollibee], INITIAL_DETECTION_STATE, 0, 20_000);
    expect(results[5].event).toEqual({ type: 'entered', location: jollibee, announce: true });
  });

  it('ignores inaccurate readings completely', () => {
    let state = INITIAL_DETECTION_STATE;
    for (let i = 0; i < 3; i++) {
      const result = detect(fixAt(0, 80), [jollibee], state, i * 5_000, CONFIG);
      expect(result.quality).toBe('low-accuracy');
      expect(result.event).toBeNull();
      state = result.state;
    }
    expect(state.currentId).toBeNull();
  });

  it('switches directly from one place to a neighbour', () => {
    const neighbour = place(2, { name: 'Library', latitude: BASE.latitude + 100 / METERS_PER_DEGREE });
    const results = walk([0, 0, 100, 100], [jollibee, neighbour]);
    expect(results[3].event).toEqual({ type: 'entered', location: neighbour, announce: true });
  });

  it('forgets the current place if it was deleted', () => {
    const [, entered] = walk([0, 0], [jollibee]);
    const result = detect(fixAt(500), [], entered.state, 20_000, CONFIG);
    expect(result.state.currentId).toBeNull();
    expect(result.event).toBeNull(); // no "you left" for a place that no longer exists
  });
});
