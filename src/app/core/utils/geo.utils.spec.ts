import { calculateDistance, formatDistance, parseCoordinates } from './geo.utils';

describe('parseCoordinates', () => {
  it('reads "lat, lng" as copied from Google Maps', () => {
    expect(parseCoordinates('16.0120, 120.3570')).toEqual({ latitude: 16.012, longitude: 120.357 });
  });

  it('accepts spaces only, and extra whitespace', () => {
    expect(parseCoordinates('  16.0120   120.3570 ')).toEqual({ latitude: 16.012, longitude: 120.357 });
  });

  it('accepts negative values (south / west)', () => {
    expect(parseCoordinates('-33.8688, 151.2093')).toEqual({ latitude: -33.8688, longitude: 151.2093 });
  });

  it('rejects text, missing parts and out-of-range values', () => {
    expect(parseCoordinates('Jollibee')).toBeNull();
    expect(parseCoordinates('16.0120')).toBeNull();
    expect(parseCoordinates('95, 120')).toBeNull(); // latitude > 90
    expect(parseCoordinates('16, 200')).toBeNull(); // longitude > 180
  });
});

describe('formatDistance', () => {
  it('shows whole meters below 1 km', () => {
    expect(formatDistance(12.4)).toBe('12 m');
    expect(formatDistance(999.4)).toBe('999 m');
  });

  it('shows kilometers with one decimal from 1 km', () => {
    expect(formatDistance(1000)).toBe('1.0 km');
    expect(formatDistance(1234)).toBe('1.2 km');
  });
});

describe('calculateDistance', () => {
  it('is 0 for the same point', () => {
    expect(calculateDistance(16.012, 120.357, 16.012, 120.357)).toBe(0);
  });

  it('measures 0.001° of latitude as about 111 m', () => {
    expect(calculateDistance(16.012, 120.357, 16.013, 120.357)).toBeCloseTo(111.19, 1);
  });

  it('measures 1° of longitude at the equator as about 111.2 km', () => {
    expect(calculateDistance(0, 0, 0, 1)).toBeCloseTo(111_195, -1);
  });

  it('shrinks longitude distance away from the equator (cos(16°) ≈ 0.961)', () => {
    const atEquator = calculateDistance(0, 120, 0, 120.001);
    const at16North = calculateDistance(16, 120, 16, 120.001);
    expect(at16North / atEquator).toBeCloseTo(Math.cos((16 * Math.PI) / 180), 3);
  });

  it('gives the same result in both directions', () => {
    const there = calculateDistance(16.012, 120.357, 15.348, 121.047);
    const back = calculateDistance(15.348, 121.047, 16.012, 120.357);
    expect(there).toBeCloseTo(back, 6);
  });
});
