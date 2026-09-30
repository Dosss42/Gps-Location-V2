# Milestone 4: Save Locations (SQLite + CRUD)

**Goal:** save places on the phone permanently: create one from your current GPS position, list, view, edit, delete. Voice settings are saved too.

> Built by Claude with explanations. **UI/UX isn't final**: the screens are simple and functional on purpose, and a later restyle will change only looks, not logic.

| Part | Content | Status |
|---|---|---|
| A | Storage design: SQLite, repositories, store | ✅ |
| B | Database service, schema, migrations | ✅ |
| C | Repositories (SQLite + in-memory) and `LocationStore` | ✅ |
| D | Screens: Saved Places, Save/Edit form, Details | ✅ |
| E | Settings persistence, app startup, backup decision | ✅ |
| F | Testing | ✅ Emulator · real phone pending |

---

# Part A: Design

## A1. Layers

```text
 Pages (list, form, detail, home)            ← show data, react to taps
        │ read signals / call methods
        ▼
 LocationStore  (locations signal, in memory) ← the app's single source of truth
        │
        ▼
 LocationRepository (interface)               ← "save / load locations", no SQL visible
   ├── SqliteLocationRepository   (phone)     ← all the SQL
   └── MemoryLocationRepository   (browser, unit tests)
        │
        ▼
 DatabaseService                              ← opens SQLite once, runs migrations
        │
        ▼
 @capacitor-community/sqlite 8.1.1 → whereamiSQLite.db (app-private folder)
```

**Why so many layers for a student project?** Each one has one job, and each paid off already:
- The **repository interface** lets the same pages run in the browser (memory) and on the phone (SQLite). This was the architecture.md §11 decision (option b), chosen over configuring `jeep-sqlite` + WASM for the browser.
- The **store** keeps the list in memory as a signal, so every page updates automatically after a change, and detection (Milestones 5–6) can read it on every GPS update without touching SQLite.
- The **DatabaseService** means only one file knows about connections and schema versions.

## A2. How Angular picks SQLite or memory

```ts
@Injectable({
  providedIn: 'root',
  useFactory: () => Capacitor.isNativePlatform()
    ? new SqliteLocationRepository(inject(DatabaseService))
    : new MemoryLocationRepository(),
})
export abstract class LocationRepository { … }
```

Pages and the store just `inject(LocationRepository)`. They never know which one they got. (`SqliteLocationRepository implements LocationRepository`: an abstract class can be used like an interface.)

---

# Part B: Database

## B1. Schema (version 1)

Exactly the design from architecture.md §7, with **constraints** so bad data can't get in:

| Column | Rule |
|---|---|
| `type` | `CHECK (type IN ('area','campus','building','floor','room','place'))` |
| `latitude` / `longitude` | `CHECK` −90…90 / −180…180, `NULL` allowed (rooms) |
| `radius_m` | `CHECK (radius_m > 0)` |
| `parent_id` | `REFERENCES locations(id) ON DELETE SET NULL`: deleting a campus keeps its buildings, just without a parent |

Plus `settings (key TEXT PRIMARY KEY, value TEXT)`.

## B2. Migrations: how the schema will change later

```ts
const MIGRATIONS = [ /* v1 */ `CREATE TABLE …`, /* v2 would go here */ ];
```

On every start, `migrate()` reads SQLite's built-in **`PRAGMA user_version`** (0 for a new database) and runs every newer entry, **one transaction per version**, bumping `user_version` at the end.

**Rule: never edit an entry that already shipped.** Phones that ran it won't run it again, so add a new entry instead.

Checked in the plugin's source code:
- It enables foreign keys when opening (needed for `ON DELETE SET NULL`).
- It only touches the version when you register its own upgrade statements, which we don't. So our own migrations are safe.

## B3. Safe SQL

```ts
db.run('DELETE FROM locations WHERE id = ?;', [id]);
```

`?` placeholders let the plugin insert values safely. A name like `Joe's Store` can't break the SQL (no **SQL injection**). Never build SQL by gluing strings together.

---

# Part C: Store and models

## C1. `location.model.ts`

- `SavedLocation`: one row, in camelCase (`radiusM`, `createdAt`)
- `LocationInput = Omit<SavedLocation, 'id' | 'createdAt' | 'updatedAt'>`: what a form provides
- `LOCATION_TYPES`, `LOCATION_CATEGORIES` (fixed list, no categories table), `DEFAULT_RADIUS_M = 30`, `MIN_RADIUS_M = 10`, `MAX_RADIUS_M = 500`

The SQLite repository converts rows (`radius_m`) to objects (`radiusM`) in `toSavedLocation()`, and SQL stays snake_case.

## C2. `LocationStore`

| Member | What it does |
|---|---|
| `locations` (signal) | All places, sorted by name |
| `load()` | Loads once at startup. Calling again reuses the first load. |
| `getById(id)` | From memory. Inside a `computed`, it's reactive. |
| `create / update / delete` | Write through the repository, then **reload from storage**, so memory always equals the database |
| `normalize()` (private) | Trims text. No radius without coordinates. |

---

# Part D: Screens

| Route | Page | What it does |
|---|---|---|
| `/locations` | **Saved Places** | List with category, radius and **live distance** (nearest first when GPS is on). Empty state. **+** button. |
| `/locations/new` | **Save Current Location** | Takes the GPS position (reuses a reading up to 5 s old), then name*, description, category, type, radius slider. Warns when accuracy is worse than the radius. |
| `/locations/:id` | **Details** | Coordinates, radius, **live distance**, a green "inside this place's radius" badge, Speak, Edit, Delete (with confirmation) |
| `/locations/:id/edit` | Same form, edit mode | Keeps the saved position unless you tap "Move to my current position" |

`locations/new` must be listed **before** `locations/:id` in `app.routes.ts`, otherwise "new" is read as an id.

Home got two buttons: **Save current location** (disabled until there's a GPS fix) and **Saved places**.

**Details worth knowing:**
- **Reactive Forms** (`NonNullableFormBuilder`, `Validators.required/maxLength/min/max` + a custom `notBlank`). Ionic shows each field's `errorText` automatically when it's invalid and touched.
- **Route parameters as inputs:** `readonly id = input<string>()`. This works because `main.ts` has `withComponentInputBinding()`.
- **Bug avoided:** `@if (distanceM(); as d)` treats **0 m as false**, so right after saving, distance would show "Unknown". The template compares with `null` explicitly instead.
- **Speak on Details** says *"Jollibee. Latitude 16.012. Longitude 120.357. It is about 44 meters from you."* (`buildSavedLocationMessage`, your spec's format + distance).

The "inside radius" badge is the heart of **Milestone 5**. It already works per place, and Milestone 5 turns it into automatic detection across all places.

---

## D5. Update: saving a place without being there

At first a place could only be saved at your current GPS position. **Your request:** save places manually, e.g. the library while sitting at home.

The form (now titled **"Save a Place"**) has a **"Where is it?"** panel with four ways to set the position:

| Way | How | Needs |
|---|---|---|
| **Map pin** | Tap the map or drag the orange pin. The orange circle shows the detection radius and follows the slider. | Internet for map tiles |
| **Search** | Type e.g. "San Miguel Elementary School Calasiao" → **Search** (or Enter) → tap a result: the pin jumps there and the **name is pre-filled** | Internet (Nominatim) |
| **Paste coordinates** | `16.0120, 120.3570` (as copied from Google Maps) → **Go** | Nothing |
| **Use my current position** | One GPS reading, on request (asks permission the first time) | GPS |

Other changes:
- The form **never turns GPS on by itself**. It uses the current position only if location is already on. Otherwise the map starts at your last position, a saved place, or the Philippines.
- **Save place** on home works even when location is off.
- `accuracy` is `null` for hand-picked points, so the "GPS accuracy is worse than the radius" warning only appears for GPS positions.

New code:
- `shared/components/location-picker/`: the map with a draggable SVG pin (`L.divIcon`, because Leaflet's default marker images break with bundlers) and the radius circle. Inputs: `position`, `radiusM`, `fallbackCenter`. Output: `positionChange`.
- `GeocodingService.search()` + `toSearchResults()`: runs only on button press, at most 1 per 1.1 s (Nominatim policy: no search-as-you-type). The search text is sent to Nominatim, as stated in Settings.
- `parseCoordinates()` in `geo.utils.ts` (4 tests), and `toSearchResults()` (2 tests)
- Dark-mode map tiles and the tile-gap background moved to `src/theme/variables.scss`, so **every** map (home + picker) follows the theme

Tested on the emulator with location **off**:
1. Save place → form, **0 GPS calls**.
2. Search "San Miguel Elementary School Calasiao" → 1 result → tap → pin + name.
3. Tap the map → pin moves (16.011776, 120.358455).
4. Save → SQL `INSERT` with those coordinates.
5. Home: new orange circle on the map.
6. Move there → *"You are currently at San Miguel Elementary School."*

---

# Part E: Settings, startup, backup

## E1. Voice settings are saved

`SpeechService` stores its settings as JSON under the key `speech` in the `settings` table.
- **Debounced save:** sliders fire many changes per second, so it waits 500 ms after the last change and writes once.
- **`parseSpeechSettings()`** validates what it reads, so broken JSON, missing fields or out-of-range values fall back to defaults. (4 tests.)

## E2. Loading at startup: `provideAppInitializer` in `main.ts`

```ts
provideAppInitializer(() => {
  const locations = inject(LocationStore);
  const speech = inject(SpeechService);
  return Promise.all([locations.load(), speech.loadSettings()]);
}),
```

This runs before the first screen. Both loaders catch their own errors, so a storage problem can never stop the app from starting.

## E3. Backup decision (postponed from architecture.md §15)

**Decision: no cloud backup, no device transfer.** This keeps the welcome screen's promise: *"Your saved places stay on this phone."*
- `AndroidManifest.xml`: `allowBackup="false"`, `fullBackupContent="false"`, `dataExtractionRules="@xml/data_extraction_rules"`
- `res/xml/data_extraction_rules.xml` excludes everything (Android 12+)
- Trade-off: moving to a new phone loses saved places. A future **export/import** feature would fix that, under the user's control.

## E4. Costs to know

- **APK size: about 4 MB → 14.5 MB.** The plugin bundles SQLCipher (encryption) for several processor types, even for unencrypted databases. A Google Play *App Bundle* makes each phone download only its own part.
- `npm install` added 17 packages (mostly `jeep-sqlite`, the plugin's web part). We don't load it.

---

# Part F: Testing

**Unit tests (41 total, all pass):**
- store: create, sort, trim, update, delete + parent cleared
- `parseSpeechSettings`
- `formatDistance`
- `buildSavedLocationMessage`
- the new pages

**Emulator (Pixel 8, API 37):**

| # | Test | Result |
|---|---|---|
| 1 | Save with empty name | ✅ Red "Please enter a name." |
| 2 | Save "Jollibee" at the current position | ✅ SQL `INSERT` in the logs, toast, list shows it at 0 m |
| 3 | **Close the app completely, reopen** | ✅ Still there. The database file `whereamiSQLite.db` (24 KB) is in the app's private folder. |
| 4 | Details at the saved spot | ✅ Distance **0 m** (the zero bug is avoided), green "inside radius" badge |
| 5 | Move 44 m away | ✅ Distance updates live to 44 m, badge disappears (radius 30 m) |
| 6 | Speak on Details | ✅ *"Jollibee. Latitude 16.012. Longitude 120.357. It is about 44 meters from you."* |
| 7 | Delete → confirm | ✅ SQL `DELETE … WHERE id = ?` → `changes: 1` → empty list with "No saved places yet" |
| 8 | Speed 1.5× → restart app → Settings | ✅ Still 1.5× |

**Noticed, not fixed (UI polish for the restyle):**
- The toast text is low-contrast (light grey on grey).
- The dialog's "DELETE" button isn't red.
- Category defaults to "School Building" (maybe it should default to "Other").

**Seen in the logs at startup:** `Cannot read properties of undefined (reading 'triggerEvent')` and `Error injecting safe area CSS`. They happen in the first milliseconds, before our code runs, and nothing visibly breaks. To check later whether they come from Capacitor itself.

**Your turn:**

| # | Test | Result |
|---|---|---|
| 9 | Real phone: save 2–3 real places (home, a store). Is the distance plausible when you walk away? | |
| 10 | Edit a place: change the name and radius, then "Move to my current position" | |
| 11 | Uninstall and reinstall the app | Data is gone (expected: no backup) |

---

## Review exercise

1. Why does `LocationStore.create()` reload the whole list from the database instead of just pushing the new item into the array? Give one advantage and one cost.
2. Why must `'locations/new'` come before `'locations/:id'` in the routes? What would the user see otherwise?
3. What happens to "Room 101" (parent: Building 1) when Building 1 is deleted? Which line of SQL decides that?
4. **Small change:** make "Other" the default category in the form. Which file and which line? Then think: would changing `LOCATION_CATEGORIES` order break places that are already saved? Why not?

## Done when

- [x] SQLite database with schema v1 and a migration system
- [x] Save current location, list, details, edit, delete
- [x] Voice settings persist
- [x] Data survives an app restart
- [x] Backup disabled, per the privacy promise
- [ ] Tests 9–11 on a real phone
- [ ] Review exercise answered
- [ ] Committed
