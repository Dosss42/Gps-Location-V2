import type { SavedLocation } from '../models/location.model';
import type { PlaceName } from '../models/place.model';
import type { PositionFix } from '../models/position.model';
import {
  buildAtSavedLocationMessage,
  buildPlaceMessage,
  buildSavedLocationMessage,
  buildUnknownLocationMessage,
  formatCoordinateForSpeech,
} from './announcement.utils';

describe('buildSavedLocationMessage', () => {
  const grocery: SavedLocation = {
    id: 1,
    parentId: null,
    name: 'Grocery Store',
    description: '',
    type: 'place',
    category: 'Business',
    latitude: 16.123456,
    longitude: 120.123456,
    radiusM: 40,
    createdAt: '',
    updatedAt: '',
  };

  it('speaks the name and coordinates (the spec example)', () => {
    expect(buildSavedLocationMessage(grocery)).toBe('Grocery Store. Latitude 16.12346. Longitude 120.12346.');
  });

  it('adds the distance when known', () => {
    expect(buildSavedLocationMessage(grocery, 40.4)).toContain('It is about 40 meters from you.');
    expect(buildSavedLocationMessage(grocery, 1)).toContain('about 1 meter from');
    expect(buildSavedLocationMessage(grocery, 1530)).toContain('about 1.5 kilometers from');
  });

  it('skips coordinates for a place without them (e.g. a room)', () => {
    const room = { ...grocery, name: 'Room 101', latitude: null, longitude: null };
    expect(buildSavedLocationMessage(room)).toBe('Room 101.');
  });

  it('says where the user is (the spec example), with the parent when there is one', () => {
    const building = { ...grocery, id: 2, name: 'Building 1' };
    const campus = { ...grocery, id: 3, name: 'ABC University' };
    expect(buildAtSavedLocationMessage(building)).toBe('You are currently at Building 1.');
    expect(buildAtSavedLocationMessage(building, campus)).toBe('You are currently at Building 1, ABC University.');
  });
});

function makeFix(overrides: Partial<PositionFix> = {}): PositionFix {
  return {
    latitude: 16.012,
    longitude: 120.357,
    accuracy: 5,
    altitude: null,
    altitudeAccuracy: null,
    speed: null,
    heading: null,
    timestamp: 0,
    ...overrides,
  };
}

describe('formatCoordinateForSpeech', () => {
  it('rounds to 5 decimals', () => {
    expect(formatCoordinateForSpeech(16.123456789)).toBe('16.12346');
  });

  it('drops trailing zeros', () => {
    expect(formatCoordinateForSpeech(16.0120000001)).toBe('16.012');
  });

  it('keeps the minus sign for south/west coordinates', () => {
    expect(formatCoordinateForSpeech(-33.8688)).toBe('-33.8688');
  });
});

describe('buildUnknownLocationMessage', () => {
  it('speaks the rounded coordinates', () => {
    expect(buildUnknownLocationMessage(makeFix())).toBe(
      'I could not identify this location. Your current coordinates are latitude 16.012 and longitude 120.357.',
    );
  });

  it('adds a warning when accuracy is worse than the limit', () => {
    const message = buildUnknownLocationMessage(makeFix({ accuracy: 182.6 }), 30);
    expect(message).toContain('GPS accuracy is low, about 183 meters.');
  });

  it('adds no warning when accuracy is within the limit', () => {
    expect(buildUnknownLocationMessage(makeFix({ accuracy: 8 }), 30)).not.toContain('accuracy');
  });
});

describe('buildPlaceMessage', () => {
  const place: PlaceName = {
    landmark: null,
    street: 'W. A. Jones Street',
    area: 'San Miguel',
    town: 'Calasiao',
    province: 'Pangasinan',
    fullAddress: '…',
    latitude: 16.012,
    longitude: 120.357,
    fetchedAt: 0,
  };

  it('speaks street, barangay, town and province', () => {
    expect(buildPlaceMessage(place, makeFix())).toBe(
      'You are near W. A. Jones Street, San Miguel, Calasiao, Pangasinan.',
    );
  });

  it('prefers a landmark over the street', () => {
    const message = buildPlaceMessage({ ...place, landmark: 'Calasiao Church' }, makeFix());
    expect(message).toBe('You are near Calasiao Church, San Miguel, Calasiao, Pangasinan.');
  });

  it('skips missing and duplicate parts', () => {
    const message = buildPlaceMessage({ ...place, street: null, area: 'Calasiao' }, makeFix());
    expect(message).toBe('You are near Calasiao, Pangasinan.');
  });

  it('warns when accuracy is poor', () => {
    expect(buildPlaceMessage(place, makeFix({ accuracy: 150 }), 30)).toContain('may not be exact');
  });
});
