import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';

import { DatabaseService } from '../services/database.service';

/**
 * Simple key → text storage for app settings (the SQLite `settings` table).
 * Same pattern as LocationRepository: SQLite on phones, memory in the browser.
 */
@Injectable({
  providedIn: 'root',
  useFactory: (): SettingsRepository =>
    Capacitor.isNativePlatform()
      ? new SqliteSettingsRepository(inject(DatabaseService))
      : new MemorySettingsRepository(),
})
export abstract class SettingsRepository {
  /** The stored text, or null if the key was never saved. */
  abstract get(key: string): Promise<string | null>;
  abstract set(key: string, value: string): Promise<void>;
}

class SqliteSettingsRepository implements SettingsRepository {
  constructor(private readonly database: DatabaseService) {}

  async get(key: string): Promise<string | null> {
    const db = await this.database.connection();
    const result = await db.query('SELECT value FROM settings WHERE key = ?;', [key]);
    return (result.values?.[0]?.value as string | undefined) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    const db = await this.database.connection();
    // "Upsert": insert, or replace the value if the key already exists.
    await db.run(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;',
      [key, value],
    );
  }
}

class MemorySettingsRepository implements SettingsRepository {
  private readonly values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}
