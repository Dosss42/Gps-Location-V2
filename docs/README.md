# Where Am I? — Project Documentation

A GPS + voice Android app built with Ionic, Angular, TypeScript and Capacitor.
It detects which **saved location** the user is at and says it out loud.

## Documents

| Document | What it covers |
|---|---|
| [architecture.md](architecture.md) | Concept, features, architecture, data flow, detection algorithm, database, hierarchy, GPS limits, TTS, plugins, Android permissions, risks |
| [milestones/01-project-setup.md](milestones/01-project-setup.md) | Environment, app identity, adding Android, running on a device, debugging |

## Milestone progress

| # | Milestone | Status |
|---|---|---|
| 1 | Project Setup | 🟡 In progress |
| 2 | GPS | ⬜ Not started |
| 3 | Text-to-Speech | ⬜ Not started |
| 4 | Save Locations (SQLite + CRUD) | ⬜ Not started |
| 5 | Distance Detection (Haversine) | ⬜ Not started |
| 6 | Automatic Announcements | ⬜ Not started |
| 7 | Campus Hierarchy | ⬜ Not started |
| 8 | Map (optional) | ⬜ Not started |
| 9 | Reverse Geocoding (optional) | ⬜ Not started |
| 10 | Testing | ⬜ Not started |

Update this table when a milestone passes its "done when" checklist.

## Tech stack (as installed)

| Part | Version |
|---|---|
| Angular (standalone components) | 22.1 |
| Ionic Angular | 9 |
| Capacitor | 8.5.2 |
| TypeScript | 6.0 |
| Test runner | Vitest 4 |
| Node.js (dev machine) | 26.2 |
| JDK | 21 |
| Android SDK platforms | 36, 37 |

## Conventions for these docs

- One file per milestone in `milestones/`, named `NN-short-name.md`.
- Each milestone file has: goal, concepts, steps, an exercise, a "done when" checklist, and a troubleshooting section.
- Design decisions that change later are updated in `architecture.md`. Don't leave outdated statements in it.
