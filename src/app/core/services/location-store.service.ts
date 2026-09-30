import { Injectable, inject, signal } from '@angular/core';

import type { LocationInput, SavedLocation } from '../models/location.model';
import { LocationRepository } from '../repositories/location.repository';

/**
 * The app's list of saved locations, kept in memory as a signal.
 * Pages read `locations()`; every change goes through create/update/delete here,
 * which write to storage and then reload the list, so memory always matches the database.
 * (Detection in Milestones 5–6 reads the in-memory list on every GPS update, never SQLite.)
 */
@Injectable({ providedIn: 'root' })
export class LocationStore {
  private readonly repository = inject(LocationRepository);

  private readonly _locations = signal<SavedLocation[]>([]);
  private readonly _loadError = signal<string | null>(null);

  readonly locations = this._locations.asReadonly();
  readonly loadError = this._loadError.asReadonly();

  private loading: Promise<void> | null = null;

  /** Loads the list once (at app start). Safe to call again: later calls reuse the first load. */
  load(): Promise<void> {
    this.loading ??= this.reload();
    return this.loading;
  }

  getById(id: number): SavedLocation | undefined {
    return this._locations().find((location) => location.id === id);
  }

  async create(input: LocationInput): Promise<SavedLocation> {
    const created = await this.repository.create(normalize(input));
    await this.reload();
    return created;
  }

  async update(id: number, input: LocationInput): Promise<SavedLocation> {
    const updated = await this.repository.update(id, normalize(input));
    await this.reload();
    return updated;
  }

  async delete(id: number): Promise<void> {
    await this.repository.delete(id);
    await this.reload();
  }

  private async reload(): Promise<void> {
    try {
      this._locations.set(await this.repository.getAll());
      this._loadError.set(null);
    } catch (error) {
      this.loading = null; // let a later load() try again
      this._loadError.set(`Could not load saved places. ${error instanceof Error ? error.message : ''}`.trim());
    }
  }
}

/** Cleans user input before saving: trimmed text, and no radius without coordinates. */
function normalize(input: LocationInput): LocationInput {
  const hasCoordinates = input.latitude !== null && input.longitude !== null;
  return {
    ...input,
    name: input.name.trim(),
    description: input.description.trim(),
    radiusM: hasCoordinates ? input.radiusM : null,
  };
}
