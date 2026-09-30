import { TestBed } from '@angular/core/testing';

import type { LocationInput } from '../models/location.model';
import { LocationStore } from './location-store.service';

// In unit tests Capacitor isn't native, so the store uses the in-memory repository.
function input(overrides: Partial<LocationInput> = {}): LocationInput {
  return {
    parentId: null,
    name: 'Building 1',
    description: 'Main academic building',
    type: 'building',
    category: 'School Building',
    latitude: 16.012,
    longitude: 120.357,
    radiusM: 30,
    ...overrides,
  };
}

describe('LocationStore', () => {
  let store: LocationStore;

  beforeEach(async () => {
    store = TestBed.inject(LocationStore);
    await store.load();
  });

  it('starts empty', () => {
    expect(store.locations()).toEqual([]);
  });

  it('creates a location and adds it to the list', async () => {
    const created = await store.create(input());
    expect(created.id).toBeGreaterThan(0);
    expect(store.locations().map((l) => l.name)).toEqual(['Building 1']);
  });

  it('keeps the list sorted by name', async () => {
    await store.create(input({ name: 'library' }));
    await store.create(input({ name: 'Canteen' }));
    expect(store.locations().map((l) => l.name)).toEqual(['Canteen', 'library']);
  });

  it('trims text and drops the radius when there are no coordinates', async () => {
    const created = await store.create(input({ name: '  Room 101 ', latitude: null, longitude: null }));
    expect(created.name).toBe('Room 101');
    expect(created.radiusM).toBeNull();
  });

  it('updates a location', async () => {
    const created = await store.create(input());
    await store.update(created.id, input({ name: 'Building One', radiusM: 45 }));
    expect(store.getById(created.id)).toMatchObject({ name: 'Building One', radiusM: 45 });
  });

  it('deletes a location and clears it as a parent', async () => {
    const campus = await store.create(input({ name: 'ABC University', type: 'campus' }));
    const building = await store.create(input({ parentId: campus.id }));
    await store.delete(campus.id);
    expect(store.getById(campus.id)).toBeUndefined();
    expect(store.getById(building.id)?.parentId).toBeNull();
  });
});
