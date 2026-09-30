import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';

import type { LocationInput, SavedLocation } from '../models/location.model';
import { DatabaseService } from '../services/database.service';
import { MemoryLocationRepository } from './memory-location.repository';
import { SqliteLocationRepository } from './sqlite-location.repository';

/**
 * Where saved locations are stored. The rest of the app only knows this interface.
 *
 * Angular picks the implementation when it's first injected:
 *  - on a phone → SQLite (real, permanent storage)
 *  - in the browser (`ionic serve`, unit tests) → in memory (lost on reload; for UI work only)
 */
@Injectable({
  providedIn: 'root',
  useFactory: (): LocationRepository =>
    Capacitor.isNativePlatform()
      ? new SqliteLocationRepository(inject(DatabaseService))
      : new MemoryLocationRepository(),
})
export abstract class LocationRepository {
  /** All locations, sorted by name. */
  abstract getAll(): Promise<SavedLocation[]>;
  abstract create(input: LocationInput): Promise<SavedLocation>;
  /** Throws if no location has this id. */
  abstract update(id: number, input: LocationInput): Promise<SavedLocation>;
  abstract delete(id: number): Promise<void>;
}
