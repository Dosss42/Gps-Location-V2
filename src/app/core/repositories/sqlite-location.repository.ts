import type { LocationInput, LocationType, SavedLocation } from '../models/location.model';
import type { DatabaseService } from '../services/database.service';
import type { LocationRepository } from './location.repository';

/** One row of the `locations` table, exactly as SQLite returns it (snake_case). */
interface LocationRow {
  id: number;
  parent_id: number | null;
  name: string;
  description: string;
  type: string;
  category: string;
  latitude: number | null;
  longitude: number | null;
  radius_m: number | null;
  created_at: string;
  updated_at: string;
}

/** SQLite-backed storage (phones). All SQL for locations lives here. */
export class SqliteLocationRepository implements LocationRepository {
  constructor(private readonly database: DatabaseService) {}

  async getAll(): Promise<SavedLocation[]> {
    const db = await this.database.connection();
    const result = await db.query('SELECT * FROM locations ORDER BY name COLLATE NOCASE;');
    return ((result.values ?? []) as LocationRow[]).map(toSavedLocation);
  }

  async create(input: LocationInput): Promise<SavedLocation> {
    const db = await this.database.connection();
    const now = new Date().toISOString();
    // "?" placeholders: the plugin inserts the values safely (no SQL injection from names like "Joe's").
    const result = await db.run(
      `INSERT INTO locations
         (parent_id, name, description, type, category, latitude, longitude, radius_m, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [...inputValues(input), now, now],
    );
    const id = result.changes?.lastId;
    if (!id) {
      throw new Error('The location was not saved.');
    }
    return { id, ...input, createdAt: now, updatedAt: now };
  }

  async update(id: number, input: LocationInput): Promise<SavedLocation> {
    const db = await this.database.connection();
    const now = new Date().toISOString();
    const result = await db.run(
      `UPDATE locations
         SET parent_id = ?, name = ?, description = ?, type = ?, category = ?,
             latitude = ?, longitude = ?, radius_m = ?, updated_at = ?
       WHERE id = ?;`,
      [...inputValues(input), now, id],
    );
    if (!result.changes?.changes) {
      throw new Error('This location no longer exists.');
    }
    const row = await db.query('SELECT * FROM locations WHERE id = ?;', [id]);
    return toSavedLocation((row.values as LocationRow[])[0]);
  }

  async delete(id: number): Promise<void> {
    const db = await this.database.connection();
    // Children (e.g. rooms of this building) keep existing: ON DELETE SET NULL clears their parent_id.
    await db.run('DELETE FROM locations WHERE id = ?;', [id]);
  }
}

/** The column values in the order used by both INSERT and UPDATE. */
function inputValues(input: LocationInput): (string | number | null)[] {
  return [
    input.parentId,
    input.name,
    input.description,
    input.type,
    input.category,
    input.latitude,
    input.longitude,
    input.radiusM,
  ];
}

function toSavedLocation(row: LocationRow): SavedLocation {
  return {
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    description: row.description,
    type: row.type as LocationType, // the table's CHECK constraint guarantees a valid value
    category: row.category,
    latitude: row.latitude,
    longitude: row.longitude,
    radiusM: row.radius_m,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
