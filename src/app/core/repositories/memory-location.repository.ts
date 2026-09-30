import type { LocationInput, SavedLocation } from '../models/location.model';
import type { LocationRepository } from './location.repository';

/**
 * In-memory storage for the browser (`ionic serve`) and unit tests.
 * Behaves like the SQLite version, but everything is lost when the page reloads.
 */
export class MemoryLocationRepository implements LocationRepository {
  private locations: SavedLocation[] = [];
  private nextId = 1;

  async getAll(): Promise<SavedLocation[]> {
    return [...this.locations].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }

  async create(input: LocationInput): Promise<SavedLocation> {
    const now = new Date().toISOString();
    const location: SavedLocation = { id: this.nextId++, ...input, createdAt: now, updatedAt: now };
    this.locations.push(location);
    return location;
  }

  async update(id: number, input: LocationInput): Promise<SavedLocation> {
    const index = this.locations.findIndex((location) => location.id === id);
    if (index === -1) {
      throw new Error('This location no longer exists.');
    }
    const updated = { ...this.locations[index], ...input, updatedAt: new Date().toISOString() };
    this.locations[index] = updated;
    return updated;
  }

  async delete(id: number): Promise<void> {
    this.locations = this.locations
      .filter((location) => location.id !== id)
      // Same rule as SQLite's ON DELETE SET NULL.
      .map((location) => (location.parentId === id ? { ...location, parentId: null } : location));
  }
}
