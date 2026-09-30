/**
 * Level of a place in the hierarchy. Drives detection priority later
 * (a room wins over its building, a building over its campus).
 */
export type LocationType = 'area' | 'campus' | 'building' | 'floor' | 'room' | 'place';

/** A place the user saved. Mirrors one row of the SQLite `locations` table. */
export interface SavedLocation {
  id: number;
  /** Parent in the hierarchy (e.g. Building 1 → ABC University), or null. Used from Milestone 7. */
  parentId: number | null;
  name: string;
  description: string;
  type: LocationType;
  /** Human label for display, e.g. "School Building", "Government". */
  category: string;
  /** Degrees. null = not GPS-detectable (e.g. a room). */
  latitude: number | null;
  longitude: number | null;
  /** Detection radius in meters. null when there are no coordinates. */
  radiusM: number | null;
  /** ISO 8601 timestamps, e.g. "2026-09-30T07:15:00.000Z". */
  createdAt: string;
  updatedAt: string;
}

/** What the user provides when creating/editing: everything except the fields the app sets. */
export type LocationInput = Omit<SavedLocation, 'id' | 'createdAt' | 'updatedAt'>;

export const LOCATION_TYPES: readonly { value: LocationType; label: string }[] = [
  { value: 'place', label: 'Place' },
  { value: 'area', label: 'Area' },
  { value: 'campus', label: 'Campus' },
  { value: 'building', label: 'Building' },
  { value: 'floor', label: 'Floor' },
  { value: 'room', label: 'Room' },
];

/** Fixed list for now (architecture.md §7: no categories table in the MVP). */
export const LOCATION_CATEGORIES: readonly string[] = [
  'School Building',
  'Business',
  'Government',
  'Health',
  'Religious',
  'Transport',
  'Home',
  'Other',
];

export const DEFAULT_RADIUS_M = 30;
export const MIN_RADIUS_M = 10;
export const MAX_RADIUS_M = 500;
