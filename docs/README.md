# Where Am I? — Project Documentation

A GPS + voice Android app built with Ionic, Angular, TypeScript and Capacitor.
It detects which **saved location** the user is at and says it out loud.

## Documents

| Document | What it covers |
|---|---|
| [architecture.md](architecture.md) | Concept, features, architecture, data flow, detection algorithm, database, hierarchy, GPS limits, TTS, plugins, Android permissions, risks |
| [guides/android-build-run-apk.md](guides/android-build-run-apk.md) | **Everyday reference:** build + sync, Android Studio, emulator, fake GPS, building/installing an APK, debugging |
| [guides/branding-welcome-and-logo.md](guides/branding-welcome-and-logo.md) | Logo (SVG), brand colors, **launcher icon steps**, Get Started screen |
| [milestones/01-project-setup.md](milestones/01-project-setup.md) | Environment, app identity, adding Android, running on a device, debugging |
| [milestones/02-gps.md](milestones/02-gps.md) | Location permissions, Geolocation plugin, position model, GPS service, live coordinates |
| [milestones/03-text-to-speech.md](milestones/03-text-to-speech.md) | TTS plugin, speech service, Speak/Stop, Settings page (language, speed, pitch, volume), first unit tests |
| [milestones/04-save-locations.md](milestones/04-save-locations.md) | SQLite, migrations, repositories, LocationStore, Save/List/Detail/Edit/Delete screens, saved settings, backup decision |
| [milestones/05-06-detection-and-announcements.md](milestones/05-06-detection-and-announcements.md) | Saved places on the map, automatic "You are currently at …", detection algorithm (hysteresis, confirmations, cooldown, accuracy gate, priority) |
| [milestones/08-09-map-and-place-names.md](milestones/08-09-map-and-place-names.md) | (Pulled forward) Leaflet map, OpenStreetMap place names, Haversine distance, privacy, offline fallback |

## Milestone progress

| # | Milestone | Status |
|---|---|---|
| 1 | Project Setup | ✅ Done (runs on Pixel 8 emulator, debug APK builds) |
| 2 | GPS | 🟢 Works on emulator. Your tests 7–11 (incl. real phone) pending |
| 3 | Text-to-Speech | 🟢 Works on emulator. Your tests 8–11 pending |
| 4 | Save Locations (SQLite + CRUD) | 🟢 Works on emulator (UI not final). Real-phone tests pending |
| 5 | Distance Detection (Haversine) | 🟢 Works on emulator (radius detection, priority) |
| 6 | Automatic Announcements | 🟢 Works on emulator. Real-phone walking tests pending |
| 7 | Campus Hierarchy | ⬜ Not started |
| 8 | Map (optional) | 🟢 Pulled forward, works on emulator (Leaflet + OSM) |
| 9 | Reverse Geocoding (optional) | 🟢 Pulled forward, works on emulator (Nominatim) |
| 10 | Testing | ⬜ Not started |

Update this table when a milestone passes its "done when" checklist.

## Tech stack (as installed)

| Part | Version |
|---|---|
| Angular (standalone components) | 22.1 |
| Ionic Angular | 9 |
| Capacitor | 8.5.2 |
| @capacitor/geolocation | 8.2.2 (Milestone 2) |
| @capacitor-community/text-to-speech | 8.0.2 (Milestone 3) |
| leaflet (+ @types/leaflet) | 1.9.4 (+ 1.9.22) (Milestone 8) |
| @capacitor-community/sqlite | 8.1.1 (Milestone 4) |
| TypeScript | 6.0 |
| Test runner | Vitest 4 |
| Node.js (dev machine) | 26.2 |
| JDK | 21 |
| Android SDK platforms | 36, 37 |

## Conventions for these docs

- One file per milestone in `milestones/`, named `NN-short-name.md`.
- Each milestone file has: goal, concepts, steps, an exercise, a "done when" checklist, and a troubleshooting section.
- Design decisions that change later are updated in `architecture.md`. Don't leave outdated statements in it.
