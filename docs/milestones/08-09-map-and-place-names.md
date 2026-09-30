# Milestones 8 + 9 (pulled forward): Map and Place Names

**Goal:** show your position on a map, and say the **name** of where you are (street, barangay, town, province) instead of only coordinates.

> Planned for later, but pulled forward at your request (your earlier version had both). Built by Claude with explanations. **Saved locations (Milestone 4) will still take priority** once they exist: "You are at Building 1" beats "You are near W. A. Jones Street".

---

## 1. Decisions and trade-offs

| Question | Decision | Why |
|---|---|---|
| Map library | **Leaflet 1.9.4** + OpenStreetMap tiles | Free, no API key or billing, small, and what your old version used. Google Maps needs a key and a billing account. Leaflet 2.0 is still alpha. |
| Place names | **OpenStreetMap Nominatim** (reverse geocoding) | Free, no key, good Philippine coverage (barangays included). Google Geocoding is more polished but needs a key and billing. |
| HTTP | `CapacitorHttp` (built into `@capacitor/core`, no new package) | On Android it makes the request natively, which lets us send our own **User-Agent**, as Nominatim's policy requires |
| Offline | Everything keeps working. The map shows grey where tiles are missing, and Speak falls back to coordinates. | Offline-first principle (architecture.md §17) |

### Privacy (important)

- Each place-name lookup **sends your coordinates to nominatim.openstreetmap.org**.
- Map tiles are downloaded from tile.openstreetmap.org, and those requests reveal roughly which area you're looking at.
- The welcome screen and Settings page now say this openly. The old "No account, no server" line was no longer true, so it was changed.

### Nominatim usage policy, and how the code follows it

| Rule | How |
|---|---|
| Max 1 request per second | At most 1 request every **5 s**, and only after moving **50 m** |
| Identify your app | `User-Agent: WhereAmI-StudentApp/0.1 (…)`. You may add a contact email if you publish. |
| Cache results | The last place is reused until you move 50 m away |
| No heavy use | Retry only after **30 s** when a request fails (probably offline) |
| Attribution | "© OpenStreetMap contributors" on the map and in Settings |

---

## 2. New files

| File | Role |
|---|---|
| `core/utils/geo.utils.ts` (+ spec, 5 tests) | **`calculateDistance()`**, the Haversine formula (planned for Milestone 5, needed now for "moved 50 m?") |
| `core/models/place.model.ts` | `PlaceName` (landmark, street, area, town, province, fullAddress, where and when it was looked up) + `PlaceLookupStatus` |
| `core/services/geocoding.service.ts` (+ spec, 4 tests) | Nominatim requests, caching, throttling, `toPlaceName()` parser |
| `shared/components/location-map/` | Reusable `<app-location-map [fix]="fix" />` (the only place Leaflet is used) |

Changed:
- `announcement.utils.ts`: new `buildPlaceMessage()` (+4 tests)
- the home page: place card, map, "Tell me where I am" button
- the welcome screen: privacy text
- Settings: OpenStreetMap note
- `angular.json`: Leaflet CSS, and `allowedCommonJsDependencies: ["leaflet"]`

## 3. Haversine in plain words

You can't subtract coordinates to get meters. One degree of longitude is about 111 km at the equator, about 107 km in Pangasinan (16°N), and 0 km at the poles. Haversine treats the Earth as a ball (radius 6,371 km) and:
1. turns the latitude/longitude differences into angles (radians)
2. computes `a`, a number describing how far apart the points are on a unit sphere
3. computes `c = 2·atan2(√a, √(1−a))`, the angle between the points as seen from Earth's center
4. distance = Earth radius × `c`

The tests check known facts: 0.001° of latitude ≈ 111 m, 1° of longitude at the equator ≈ 111.2 km, and at 16°N longitude distances shrink by cos(16°) ≈ 0.961.

## 4. How `GeocodingService` decides when to ask

```text
new GPS fix ─► moved > 50 m from the last looked-up spot?  ── no ─► keep current place
                          │ yes
                          ▼
              request already running? ── yes ─► share its result
                          │ no
                          ▼
              allowed yet? (5 s after success / 30 s after failure) ── no ─► place = unknown (null)
                          │ yes
                          ▼
              ask Nominatim ─► success: store place, status 'found' (or 'not-found')
                             └► failure: clear place, status 'unavailable'
```

**Bug found while testing offline:** the first version kept the old place when a lookup failed. After moving 170 m with no internet, Speak said the *old* street, and after travelling it could have been kilometres wrong. **Rule now: a place name is only valid within 50 m of where it was looked up.** Otherwise it's cleared, and Speak says the coordinates.

## 5. Parsing Philippine addresses (`toPlaceName`)

A real answer for 16.012, 120.357 (Calasiao):

```json
"address": { "road": "W. A. Jones Street", "neighbourhood": "Estacion",
             "quarter": "San Miguel", "suburb": "Nalsian", "village": "Talibaew",
             "town": "Calasiao", "state": "Pangasinan", "region": "Ilocos Region" }
```

- **area (barangay)** = the first of `quarter, village, suburb, hamlet, neighbourhood`
  - Real-world lesson: two requests for the same spot, 20 minutes apart, answered differently. One had `village: San Miguel`, the other `village: Talibaew`. `quarter: San Miguel` was stable, and the map shows *San Miguel Elementary School* next to the point, so `quarter` goes first.
- **landmark** = `name`, unless the category is `highway`/`place`/`boundary` (then the "name" is just the road)
- **town** = `town | city | municipality` · **province** = `state | province | county`

## 6. What the user sees and hears

- **Place card:** "YOU ARE NEAR" + big title (barangay, else town, landmark or street) + full address line. While loading: spinner. Offline: "Place name unavailable. Check your internet connection."
- **Map:** blue dot + accuracy circle, follows you until you drag it, then a ⌖ **recenter** button appears. Dark mode inverts the tiles, so the map is dark too.
- **Tell me where I am:**
  - with a place name: *"You are near W. A. Jones Street, San Miguel, Calasiao, Pangasinan."* (a landmark replaces the street when there is one; a poor-accuracy warning is added if needed)
  - without one: *"I could not identify this location. Your current coordinates are…"*

## 7. Leaflet + Ionic details worth knowing

| Issue | Solution in `LocationMapComponent` |
|---|---|
| Leaflet needs the real `<div>` in the page | Create the map in `afterNextRender()` |
| Grey areas when the container size changes (page animation, cards) | A `ResizeObserver` calls `map.invalidateSize()` |
| Angular's scoped styles can't reach Leaflet's own DOM | `ViewEncapsulation.None`, with every rule scoped under `app-location-map` |
| Default marker images break with bundlers | No image markers: a `circleMarker` dot + `circle` for accuracy |
| Memory leaks when the page is destroyed | `DestroyRef.onDestroy` → `map.remove()`, `resizeObserver.disconnect()` |

## 8. Testing (emulator, Calasiao test point)

| # | Test | Result |
|---|---|---|
| 1 | Build, 23 unit tests, lint | ✅ |
| 2 | Map tiles load in the Android WebView | ✅ Streets, San Miguel Elementary School, blue dot + circle |
| 3 | Nominatim request from the device | ✅ HTTP 200, native request with our User-Agent |
| 4 | Place card | ✅ "San Miguel" + full address |
| 5 | Speak (online) | ✅ *"You are near W. A. Jones Street, San Miguel, Calasiao, Pangasinan."* Reused the cached place, no extra request. |
| 6 | Dark mode | ✅ Dark map tiles, readable card |
| 7 | Offline + moved 170 m | ✅ (after the fix in §4) Card: "Place name unavailable…". Speak: coordinates. Map: grey where tiles are missing. |

**Your turn:**

| # | Test | Result |
|---|---|---|
| 8 | Real phone, at home: is the barangay name correct? If not, which field had the right one? (Tell me the JSON field names, not your address.) | |
| 9 | Walk 100 m+ with the app open: does the place name update? | |
| 10 | Drag the map → recenter button appears → tap it | |

## 9. Review exercise

1. Why must the place name be cleared when a lookup fails, instead of keeping the last one? Describe a situation where keeping it would mislead a visually impaired user.
2. Why does the home page wrap `geocoding.updateForFix(fix)` in `untracked(...)` inside the `effect`? What would happen without it?
3. Nominatim allows 1 request per second. We use 5 s + 50 m. Estimate how many requests per minute the app makes while you walk (≈1.4 m/s).
4. **Small change:** make the place card title say **"Barangay San Miguel"** when the area came from `quarter` or `village`. Where would you change the code, and why might this be wrong for some places?

## 10. Done when

- [x] Map with position and accuracy, follow + recenter, dark mode
- [x] Place names via Nominatim, following its usage policy
- [x] Speak uses the place name, with an offline fallback to coordinates
- [x] Privacy disclosed on the welcome screen and in Settings
- [x] Haversine utility with tests
- [ ] Tests 8–10 on a real phone
- [ ] Review exercise answered
