# Architecture & Design

This document describes **what** the app does and **how it is designed**, before any feature code is written.

---

## 1. Project concept

"Where Am I?" is a talking position assistant. The phone gets a GPS fix and compares it with places **the user saved**. If the user is inside one of them, the app speaks its name. If not, it speaks the coordinates.

**The app does not know the world. It only knows the user's list of places.** That keeps it offline, private and free. It also makes the app useful for accessibility, for example a visually impaired student moving around a campus.

## 2. Core features

| Feature | Description |
|---|---|
| Live position | Latitude, longitude, accuracy (plus altitude, speed, heading, timestamp when available) |
| Accuracy feedback | Warns when the fix is too poor to trust |
| Save current location | Takes a GPS fix, then asks for name, description, category, radius, type, parent |
| Saved locations CRUD | List, view details, edit, delete |
| Distance | Haversine distance from the user to each saved place |
| Detection | "Which saved place am I in?", with priority rules when places overlap |
| Auto announcements | Speaks once on entering a place, never repeats while the user stays |
| Manual Speak | Speaks the current place, or the coordinates as a fallback |
| Speech settings | Rate, language, volume, pitch, stop |

## 3. MVP vs future features

**MVP (Milestones 1–7):** all core features above, plus the campus → building hierarchy. Runs while the app is open (foreground only).

**Future:**
- Map view (Milestone 8)
- Reverse geocoding to a street address (Milestone 9, needs internet)
- Room-level identification using **QR codes or NFC tags**, BLE beacons, or Wi-Fi RTT
- Background announcements while the phone is in a pocket (needs a foreground service)
- Filipino voice and message translations
- Import/export of locations, for example a teacher sharing a campus file with students

## 4. System architecture

```text
src/app/
├── core/
│   ├── models/
│   │   ├── location.model.ts        SavedLocation, LocationType, NewLocation
│   │   ├── position.model.ts        PositionFix (our own shape, not the plugin's)
│   │   ├── detection.model.ts       DetectionStatus, DetectionState
│   │   └── settings.model.ts        AppSettings + defaults
│   ├── utils/
│   │   ├── geo.utils.ts             calculateDistance(): pure function, unit-tested
│   │   └── announcement.utils.ts    builds the sentences to speak
│   └── services/
│       ├── geolocation.service.ts   permissions + watchPosition → currentFix signal
│       ├── speech.service.ts        wraps the TTS plugin (speak/stop/languages)
│       ├── database.service.ts      opens SQLite, runs schema migrations
│       ├── location.repository.ts   SQL for locations (CRUD only)
│       ├── settings.service.ts      loads/saves settings
│       └── location-detection.service.ts  candidates → priority → state machine
├── pages/
│   ├── home/                 live position, detected place, big buttons
│   ├── locations/            saved list
│   ├── location-form/        create + edit (one page, two modes)
│   ├── location-detail/      details, live distance, speak/edit/delete
│   └── settings/
└── shared/components/
    └── accuracy-badge/       reused on home + detail
```

### Why it's structured this way

- **Pages only display and react.** They never call Capacitor plugins or write SQL.
- **One service per plugin.** Replacing the TTS plugin later changes only `speech.service.ts`.
- **`database.service` and `location.repository` are separate.** The first handles the connection and schema changes. The second holds the queries, so changing a query can't break migrations.
- **`utils/` holds pure functions** (same input gives the same output, no plugins). They are unit-tested with **Vitest** on the PC, without a phone.
- **`location-form` serves both Save and Edit.** It's the same form, so it's one page.
- **State is held in Angular signals**, which fits Angular 22 standalone components.

## 5. Data flow

```text
GPS chip / Wi-Fi / cell
        │  (Android Fused Location Provider)
        ▼
Capacitor Geolocation plugin
        ▼
GeolocationService ── converts to PositionFix ──► currentFix (signal)
        │                                          │
        ▼                                          ▼
LocationDetectionService ◄── locations (cached from LocationRepository ◄── SQLite)
        │                ◄── settings (thresholds, cooldown)
        ├──► detectionState (signal) ──► HomePage shows it
        └──► "entered X" event ──► SpeechService.speak(buildEnterMessage(X))
```

Saved locations are loaded **once into memory** and reloaded after every create, edit or delete. Detection runs on every GPS update, so it never queries SQLite per update.

## 6. GPS detection algorithm

The naive approach has three problems: it picks the first match, it trusts every fix, and it flip-flops at the edge of a radius. The improved algorithm:

```text
ON each new position fix:

  1. ACCURACY GATE
     IF fix.accuracy > settings.maxAcceptableAccuracy:
         status = LOW_ACCURACY   (show warning)
         keep the current detected place unchanged   ← don't "exit" because of a bad fix
         RETURN

  2. FIND CANDIDATES
     FOR each location that has coordinates:
         d = calculateDistance(fix, location)
         limit = location.radius
         IF location is the currently detected place:
             limit = location.radius + settings.exitMargin    ← HYSTERESIS
         IF d <= limit: add {location, d} to candidates

  3. PICK THE MOST SPECIFIC   (never "first DB row")
     sort candidates by:
         a) type rank:  room > floor > building > place > campus > area
         b) smaller radius first         (tie-breaker: more specific)
         c) smaller d / radius           (tie-breaker: more "central")
     best = candidates[0] or null

  4. STABILIZE (debounce)
     IF best is the same as pendingBest: pendingCount++
     ELSE pendingBest = best; pendingCount = 1
     IF pendingCount < settings.requiredConfirmations (e.g. 2): RETURN

  5. TRANSITION
     IF best.id != current.id:
         previous = current
         current  = best
         IF best != null AND (now - lastAnnounced[best.id]) > settings.cooldown:
             speak "You are now at {best.name}{, parent name}."
             lastAnnounced[best.id] = now
         (optionally: IF best == null, speak "You left {previous.name}.")
```

### What each technique solves

| Technique | Problem it solves |
|---|---|
| **Detection state** (`current`) | Speak only when the place *changes*, not on every update |
| **Hysteresis** (enter at radius, exit at radius + margin) | Standing on a boundary makes the fix jump in and out. Separate enter/exit lines stop that. |
| **Confirmations / dwell** | One wild fix shouldn't switch places. Require 2–3 agreeing fixes. |
| **Cooldown per place** | Walking out and straight back in shouldn't repeat "Building 1" within ~60 s |
| **Accuracy gate** | An 80 m fix can't tell whether the user is in a 30 m circle |
| **Minimum distance change** | Optional. Skip work if the user moved < 3 m and accuracy didn't improve. Mostly reduces UI flicker. |

**Manual Speak button:** uses the latest fix if it's fresh (< ~10 s old), otherwise requests a new one. It **ignores the cooldown**, because the user asked.

All thresholds (`maxAcceptableAccuracy`, `exitMargin`, `requiredConfirmations`, `cooldown`) are **settings, tuned by testing**, not fixed truths. A starting value such as 30 m accuracy must be checked against real walks on the actual campus.

## 7. Database design

### Which tables are actually needed?

| Table | Decision | Reason |
|---|---|---|
| `locations` | **Yes** | Core data |
| `categories` | **No (MVP)** | A fixed list in code, stored as TEXT, is enough. Add a table only for custom categories with icons. |
| `location_events` | **No** | It would be a movement history of a person, which is a privacy liability. Detection only needs in-memory state. Possibly later as an opt-in debug log. |
| `settings` | **Yes, small** | Key/value table in the same SQLite file. The alternative is `@capacitor/preferences`. Chosen: SQLite, so there's one storage system and one less package. |

### ERD

```text
┌──────────────────────────────────────┐
│ locations                            │
├──────────────────────────────────────┤
│ id           INTEGER PK AUTOINCREMENT│
│ parent_id    INTEGER NULL  ──────────┼──┐  FK → locations.id
│ name         TEXT NOT NULL           │  │  (ON DELETE SET NULL)
│ description  TEXT                    │  │
│ type         TEXT NOT NULL           │◄─┘  area|campus|building|floor|room|place
│ category     TEXT                    │
│ latitude     REAL NULL               │     NULL = not GPS-detectable
│ longitude    REAL NULL               │
│ radius_m     REAL NULL               │
│ created_at   TEXT (ISO 8601)         │
│ updated_at   TEXT (ISO 8601)         │
└──────────────────────────────────────┘
   index on parent_id

┌─────────────────────┐
│ settings            │
├─────────────────────┤
│ key    TEXT PK      │   e.g. 'speechRate' → '1.0'
│ value  TEXT         │
└─────────────────────┘
```

### Design notes

- **`type` vs `category`.** `type` is the place's level in the hierarchy and drives detection priority. `category` is a human label for display. Example: a Barangay Hall is `type: place`, `category: Government`.
- **Nullable coordinates.** A room has no reliable GPS position. `NULL` means "this place exists but GPS must never auto-detect it", which leaves room for QR/NFC later.
- **`parent_id` and `type` are created in Milestone 4**, even though the hierarchy UI arrives in Milestone 7. That avoids a schema migration later.

## 8. Location hierarchy

```text
ABC University        type=campus    radius 200m   parent=null
├── Main Gate         type=place     radius 20m
├── Building 1        type=building  radius 30m
│   ├── Ground Floor  type=floor     coords NULL   ← manual / QR only
│   │   └── Room 101  type=room      coords NULL
├── Library           type=building  radius 25m
└── Canteen           type=place     radius 20m
```

When the detected place has a parent, the announcement includes it: *"You are at Building 1, ABC University."*

## 9. GPS limitations

| Environment | Typical accuracy |
|---|---|
| Open sky | 3–10 m |
| Between buildings, under trees | 10–30 m |
| Indoors | 20–50 m+, sometimes no fix |
| Approximate permission only | ~1–3 km (deliberately blurred) |

What follows from this:
- **Two buildings 20 m apart can't be told apart reliably.** Rule of thumb: radius ≥ 20–30 m, and adjacent places should not overlap heavily.
- **Floors can't be detected by GPS.** Altitude error is usually worse than horizontal error.
- **Rooms can't be detected by GPS.** Future options, cheapest first: QR code on the door, NFC tag (tap the phone; very accessible), BLE beacons, Wi-Fi RTT.
- **The first fix can be slow offline.** Assisted GPS uses the internet to find satellites faster. Without it, a cold start can take 30 s or more.
- **The fix drifts even when standing still.** That's why hysteresis and confirmations exist.

GPS itself does not need internet. Maps and address lookups do.

## 10. Text-to-speech architecture

```text
Pages ──► SpeechService.speak(text) / stop()
               │  always stops the current utterance first (interrupt, don't queue:
               │  the newest location is the only one that matters)
               │  reads rate / pitch / volume / lang from SettingsService
               ▼
        TTS plugin ──► Android TextToSpeech engine (Google Speech Services)
```

- Sentences are built in `announcement.utils.ts`, not in the service, so they can be tested and translated.
- Coordinates are **rounded to 5–6 decimals for speech**. 5 decimals ≈ 1 m.
- Language and message text must match. Setting `fil-PH` while the text is English sounds wrong.
- Offline speech works only if that language's voice data is downloaded on the phone (Android Settings → Text-to-speech).

### Planned messages

| Situation | Message |
|---|---|
| Inside a saved place | "You are currently at Building 1." |
| No place recognized | "I could not identify this location. Your current coordinates are latitude 16.12346 and longitude 120.12346." |
| Saved place selected | "Grocery Store. Latitude 16.12346. Longitude 120.12346." |

## 11. Required Capacitor plugins

| Need | Plugin | Official? | Notes |
|---|---|---|---|
| GPS | `@capacitor/geolocation` | ✅ Yes | Uses Fused Location on Android |
| Speech | `@capacitor-community/text-to-speech` | Community (well maintained) | There is no official Capacitor TTS plugin. The Web Speech API is unreliable inside Android WebView. |
| SQLite | `@capacitor-community/sqlite` | Community (the standard choice) | Native on Android. Browser use needs extra `jeep-sqlite` + WASM setup. |

No map, geocoding or background plugin in the MVP.

**Open decision (Milestone 4): SQLite during browser development**
- (a) Configure `jeep-sqlite` so `ionic serve` has a real database.
- (b) **Recommended:** SQLite on the device only, plus an in-memory repository for browser UI work, both following the same TypeScript interface. Simpler, and teaches "program to an interface". Real persistence is tested on the phone.

## 12. Android requirements and permissions

### Tooling
Node.js, Android Studio (includes SDK and emulator), JDK 21, `JAVA_HOME` and `ANDROID_HOME` set, and **a real Android phone** for GPS testing. Emulator GPS is fake: coordinates are typed in by hand.

### Manifest permissions
- `ACCESS_FINE_LOCATION`: precise, needed for building-level detection
- `ACCESS_COARSE_LOCATION`: required alongside fine on Android 12+. The user may grant only this one ("Approximate").
- **Not** `ACCESS_BACKGROUND_LOCATION`

### Permission states the app must handle

| State | App behavior |
|---|---|
| Granted, precise | Normal operation |
| Granted, approximate only | Warn: "Precise location is off, so place detection won't work", and explain how to enable it |
| Denied | Explain why location is needed, offer Retry |
| Permanently denied | Android stops showing the dialog after 2 denials. Show steps to enable it in App Settings. |
| Location services off | The plugin throws a specific error. Show "Turn on Location". |

### "While using the app" vs "Background"
- **While using:** location only while the app is in the foreground.
- **Background:** location even when closed or in another app. Needs an extra permission, strict Google Play review and a visible justification.

**This project does not need background location for the MVP.** Known limitation: when the screen turns off, the WebView pauses and updates stop. A future "pocket mode" would use a foreground service with a persistent notification.

## 13. Map decision (Milestone 8, optional)

The core app must work without a map. If a map is added, the recommendation is **Leaflet + OpenStreetMap**: no API key and no billing. Google Maps (`@capacitor/google-maps`) needs an API key and a billing account. OSM's public tile servers forbid heavy use, and offline maps need tile caching.

## 14. Reverse geocoding (Milestone 9, optional)

- **GPS coordinates** are a measurement: a point on Earth.
- **A human-readable address** ("Barangay XYZ, Calasiao, Pangasinan") is a lookup in someone's database.

| Option | Pros | Cons |
|---|---|---|
| Nominatim / OpenStreetMap | Free, no key | Max 1 request/s, must identify the app, uneven barangay coverage in the Philippines |
| Google Geocoding API | Accurate | API key, billing, terms restrictions |
| Offline boundary data (PSGC/OSM) + point-in-polygon | Works offline | Advanced, large data files |

Online options **send the user's coordinates to a third party**, and the app must disclose that. The MVP relies on saved locations instead.

## 15. Security and privacy

- Location data is sensitive. Saved places can reveal where someone lives or studies.
- All data stays on the device. There is no server.
- No movement history is stored.
- Don't `console.log` coordinates in release builds.
- Android auto-backup can copy the database to Google Drive. The `allowBackup` setting is decided in Milestone 4.
- SQLite is not encrypted by default. The plugin supports encryption if needed later.

## 16. Potential problems

- Accuracy that's good outside and bad inside, so thresholds need real-world tuning
- The fix jumping at radius edges (solved in Milestone 6)
- A radius smaller than the typical accuracy, so the place is never detected or detected randomly
- Approximate-only permission silently breaking detection unless it's checked
- Screen off, so updates stop
- TTS voice not installed for the chosen language, or a slow first `speak()`
- SQLite working on the phone but not in `ionic serve`
- Battery drain from continuous high-accuracy tracking. Stop watching when the app goes to the background.

## 17. Implementation order

The milestone order from [README.md](README.md), with three adjustments:
1. Create `type` and `parent_id` in the schema in Milestone 4.
2. Write `calculateDistance()` and its Vitest tests at the start of Milestone 5, before connecting it to GPS.
3. In Milestone 6, write the detection logic as a pure function first (fixes in, state out) and unit-test it with fake coordinates. Only then connect it to live GPS.

---

## Exercise: the boundary problem

Building 1 has a 30 m radius. Building 2's center is 40 m from Building 1's center, also with a 30 m radius. You stand exactly halfway between them, and your fix accuracy is **25 m**.

1. Which place(s) does the naive algorithm detect?
2. What happens over 10 GPS updates if the fix wanders ±10 m?
3. Which technique from section 6 fixes this? What radius or spacing advice would you give the person saving these locations?
