import { type NominatimReverseResponse, toPlaceName } from './geocoding.service';

/** A real Nominatim response for 16.012, 120.357 (Calasiao, Pangasinan), trimmed. */
const CALASIAO_ROAD: NominatimReverseResponse = {
  category: 'highway',
  name: 'W. A. Jones Street',
  display_name:
    'W. A. Jones Street, Estacion, San Miguel, Talibaew, Calasiao, Pangasinan, Ilocos Region, 2418, Philippines',
  address: {
    road: 'W. A. Jones Street',
    neighbourhood: 'Estacion',
    quarter: 'San Miguel',
    village: 'San Miguel',
    town: 'Calasiao',
    state: 'Pangasinan',
    region: 'Ilocos Region',
    postcode: '2418',
    country: 'Philippines',
  },
};

const FIX = { latitude: 16.012, longitude: 120.357 };

describe('toPlaceName', () => {
  it('extracts street, barangay, town and province', () => {
    const place = toPlaceName(CALASIAO_ROAD, FIX, 123);
    expect(place).toEqual({
      landmark: null, // the nearest thing is a road, not a landmark
      street: 'W. A. Jones Street',
      area: 'San Miguel',
      town: 'Calasiao',
      province: 'Pangasinan',
      fullAddress: CALASIAO_ROAD.display_name,
      latitude: 16.012,
      longitude: 120.357,
      fetchedAt: 123,
    });
  });

  it('prefers "quarter" when OpenStreetMap lists several overlapping areas', () => {
    // A second real answer for the same spot, from a different Nominatim server.
    const overlapping: NominatimReverseResponse = {
      ...CALASIAO_ROAD,
      address: { ...CALASIAO_ROAD.address, quarter: 'San Miguel', suburb: 'Nalsian', village: 'Talibaew' },
    };
    expect(toPlaceName(overlapping, FIX, 0)?.area).toBe('San Miguel');
  });

  it('treats a named non-road place as a landmark', () => {
    const church = { ...CALASIAO_ROAD, category: 'amenity', name: 'Saints Peter and Paul Church' };
    expect(toPlaceName(church, FIX, 0)?.landmark).toBe('Saints Peter and Paul Church');
  });

  it('returns null when Nominatim finds no address', () => {
    expect(toPlaceName({ error: 'Unable to geocode' }, FIX, 0)).toBeNull();
  });
});
