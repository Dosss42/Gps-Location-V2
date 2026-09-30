import { Injectable } from '@angular/core';
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';

const DATABASE_NAME = 'whereami';

/**
 * Schema changes, one entry per version: MIGRATIONS[0] creates version 1, MIGRATIONS[1] would
 * upgrade 1 → 2, and so on. NEVER edit an entry that has shipped: phones that already ran it
 * won't run it again. Add a new entry instead.
 */
const MIGRATIONS: readonly string[] = [
  // Version 1 (Milestone 4): see docs/architecture.md §7 for the design.
  `
  CREATE TABLE IF NOT EXISTS locations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id   INTEGER NULL REFERENCES locations(id) ON DELETE SET NULL,
    name        TEXT    NOT NULL,
    description TEXT    NOT NULL DEFAULT '',
    type        TEXT    NOT NULL DEFAULT 'place'
                CHECK (type IN ('area', 'campus', 'building', 'floor', 'room', 'place')),
    category    TEXT    NOT NULL DEFAULT '',
    latitude    REAL    NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude   REAL    NULL CHECK (longitude BETWEEN -180 AND 180),
    radius_m    REAL    NULL CHECK (radius_m > 0),
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_locations_parent_id ON locations(parent_id);
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
];

/**
 * Owns the single SQLite connection (Android/iOS only) and keeps the schema up to date.
 * Repositories call connection(); nothing else in the app talks to the SQLite plugin.
 */
@Injectable({ providedIn: 'root' })
export class DatabaseService {
  private readonly sqlite = new SQLiteConnection(CapacitorSQLite);
  private opening: Promise<SQLiteDBConnection> | null = null;

  /** Opens the database the first time it's needed; later calls reuse the same connection. */
  connection(): Promise<SQLiteDBConnection> {
    this.opening ??= this.open().catch((error: unknown) => {
      this.opening = null; // allow a retry next time
      throw error;
    });
    return this.opening;
  }

  private async open(): Promise<SQLiteDBConnection> {
    // During live reload the web page restarts but the native side keeps old connections.
    // Reuse one if it's still valid instead of creating a duplicate (which would throw).
    const consistent = (await this.sqlite.checkConnectionsConsistency()).result;
    const exists = (await this.sqlite.isConnection(DATABASE_NAME, false)).result;
    const db =
      consistent && exists
        ? await this.sqlite.retrieveConnection(DATABASE_NAME, false)
        : await this.sqlite.createConnection(DATABASE_NAME, false, 'no-encryption', 1, false);

    await db.open(); // the plugin turns foreign keys ON here (needed for ON DELETE SET NULL)
    await migrate(db);
    return db;
  }
}

/** Runs every migration newer than the database's stored version (SQLite's `user_version`). */
async function migrate(db: SQLiteDBConnection): Promise<void> {
  const result = await db.query('PRAGMA user_version;');
  const currentVersion = Number(result.values?.[0]?.user_version ?? 0);

  for (let version = currentVersion + 1; version <= MIGRATIONS.length; version++) {
    // One transaction per version: either the whole upgrade (and the version bump) happens, or none of it.
    await db.execute(`${MIGRATIONS[version - 1]}\nPRAGMA user_version = ${version};`, true);
  }
}
