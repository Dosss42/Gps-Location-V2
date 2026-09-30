# Milestones 5 + 6: Detection and Automatic Announcements

**Goal:** saved places show on the map, and when you walk into one the phone says **"You are currently at Jollibee."** once, without repeating and without flip-flopping when GPS wobbles.

> Built by Claude with explanations, at your request ("when I have a saved place, show it on the map, and when I'm nearby, tell me"). It combines Milestone 5 (radius detection) and Milestone 6 (automatic announcements with state, cooldown and accuracy filtering). The design is architecture.md §6.

---

## 1. What the user sees and hears

| Situation | App |
|---|---|
| Saved places | Drawn on the map as **orange circles** (size = detection radius) with a name label below the center. **Tap a circle** to open the place. |
| You walk into a place | After 2 agreeing GPS readings: speaks ***"You are currently at Jollibee."*** + a short **vibration**. The circle turns **green**, and a green **"SAVED PLACE · You are at Jollibee"** panel appears (tap to open). |
| You stay inside | Silent. No repeating. |
| You walk out and straight back in | Silent (60 s cooldown) |
| GPS reading worse than 50 m | Ignored completely (can't tell which place you're in) |
| "Tell me where I am" | **1.** saved place → **2.** OpenStreetMap name → **3.** coordinates |
| Settings → *Announce places automatically* | Turns the automatic voice on or off (saved). The panel and map still update. |

Place with a parent (Milestone 7): *"You are currently at Building 1, ABC University."*

---

## 2. The algorithm: `core/utils/detection.utils.ts`

This is **pure functions**: no Angular, no plugins, no clock (the time is passed in). That's why 14 unit tests can check every situation on the PC in milliseconds, instead of walking around campus.

```text
detect(fix, locations, state, now, config) → { state, event, quality }

 0. current place deleted meanwhile?            → forget it quietly
 1. fix.accuracy > 50 m?                         → ignore reading (quality 'low-accuracy')
 2. findCandidates: places whose circle contains the fix
      (the CURRENT place counts with radius + 10 m: hysteresis)
 3. pickMostSpecific: type rank (room > floor > building > place > campus > area),
      then smaller radius, then relatively closer center
 4. confirmation: same best place as last reading? count++ : count = 1
      count < 2 → no change yet
 5. transition: best ≠ current →
      entered (announce only if not announced in the last 60 s) | exited
```

### Why each rule exists

| Rule | Without it |
|---|---|
| **State** (`currentId`) | "You are at Jollibee" every 5 seconds |
| **Hysteresis** (enter at 30 m, leave only beyond 40 m) | Standing near the edge, GPS drift gives "in, out, in, out…" |
| **2 confirmations** | One wild reading 200 m away would "leave" and "re-enter" |
| **60 s cooldown** | Walking out and back in repeats the announcement |
| **Accuracy gate (50 m)** | A ±180 m reading (like the PC browser) could claim you're in a building you're not in |
| **Most specific wins** | Inside a campus (200 m) *and* Building 1 (30 m): "Building 1", never "whatever row came first from the database" |

### Tuning (`DEFAULT_DETECTION_CONFIG`)

```ts
{ maxAccuracyM: 50, exitMarginM: 10, requiredConfirmations: 2, cooldownMs: 60_000 }
```

These are **starting values**, to be tuned by walking the real campus:
- announcements come too late → fewer confirmations, or a bigger radius
- flip-flopping at the edges → a bigger exit margin
- no detection indoors → maybe raise `maxAccuracyM`

GPS updates arrive about every 5 s, so 2 confirmations ≈ 5–10 s delay after entering.

---

## 3. `LocationDetectionService`

Connects the pure rules to the app:

| Part | What it does |
|---|---|
| `effect` on `geo.fix()` | Runs `detect()` once per **new GPS reading**. The list of places is read `untracked`, so saving or editing a place doesn't count as an extra confirmation. |
| `current` (signal) | The confirmed place, used by the home panel and the green map circle |
| On `entered` + `announce` + setting on | `speech.speak(buildAtSavedLocationMessage(...))` + `Haptics.impact()` |
| `placeFor(fix)` | For the button: the confirmed place, or an **immediate** match (no waiting for a 2nd reading, since the user asked) |
| `parentOf(place)` | For "…, ABC University" |
| `autoAnnounce` / `setAutoAnnounce` / `load` | Settings switch, saved as `autoAnnounce` in the settings table |

It's created in `provideAppInitializer` (`main.ts`), so detection runs for the whole app, not only while the home page is open.

---

## 4. Map changes: `LocationMapComponent`

New inputs and output:

```html
<app-location-map [fix]="fix" [places]="store.locations()"
                  [highlightedId]="detection.current()?.id ?? null"
                  (placeSelected)="openPlace($event)" />
```

- Places live in their own `L.layerGroup()`, which is cleared and redrawn whenever `places` or `highlightedId` changes.
- After redrawing, `dot.bringToFront()` keeps your position above the circles.
- Labels are Leaflet tooltips placed **below** the center (`direction: 'bottom', offset: [0, 12]`). At the center they hid the blue dot.

### Bug found while testing: map crash, no dot

The first version drew the saved-place circles right after creating the map, before it had a center/zoom. Leaflet threw `Cannot read properties of undefined (reading 'intersects')`, and that also stopped the code that draws the user's dot.

**Fix:** create the map with an initial view (`setView(current fix or world, zoom)`). **Rule: a Leaflet map needs a view before any shape is added.**

---

## 5. Testing

**Unit tests (61 total):**
- `detection.utils.spec.ts` (14): announce after 2 readings, no repeat, one wild reading ignored, hysteresis at the edge, exit, cooldown on and after, inaccurate readings ignored, building beats campus, smaller circle wins, neighbour switch, deleted place forgotten, no coordinates skipped
- `buildAtSavedLocationMessage` (with and without parent)

**Emulator (a place "Jollibee", 30 m radius):**

| # | Test | Result |
|---|---|---|
| 1 | Save it while standing on it | ✅ ~5–10 s later: *"You are currently at Jollibee."* + vibration, green panel, green circle |
| 2 | Start 170 m away | ✅ No panel, no speech |
| 3 | Walk in (22 m from center) | ✅ Announced once, dot visible above the label |
| 4 | Walk out, straight back in | ✅ Silent (cooldown). **1 announcement total.** |
| 5 | "Tell me where I am" inside | ✅ *"You are currently at Jollibee."* |

**Your turn (real phone, outdoors):**

| # | Test | Result |
|---|---|---|
| 6 | Save your gate/door, walk 100 m away, walk back. How many seconds after entering does it speak? | |
| 7 | Stand near the edge of the circle for a minute. Any repeats? | |
| 8 | Save two places ~50 m apart, walk from one to the other | |
| 9 | Turn off "Announce places automatically" → walk in: the panel appears, no voice | |

---

## 5b. Change: location is OFF until the user turns it on

At first the app started GPS the moment it opened. That's convenient, but it means tracking the user without being asked. **Your decision:** it's better if the app does not get the location automatically.

| When | What happens |
|---|---|
| App opens | **No GPS, no permission popup.** A panel says "Location is off. Tap Get my location…", the status line shows a grey dot. |
| **Get my location** | Turns location on (asks permission the first time) and keeps it live while the app is open. The button becomes **Stop location**. |
| **Tell me where I am** | If location is off, turns it on first, then speaks |
| **Stop location** | Stops GPS **and forgets the last position** (the coordinates, map and "You are at" panel disappear, detection resets) |
| App goes to background → comes back | Restarts GPS **only if location was on** |
| Settings → **Start location when the app opens** | Default **off**. Turn on to get the old behaviour, e.g. for a user who needs announcements right away. Saved as `autoStartLocation`. |

**Trade-off:** automatic announcements only work while location is on.

### Follow-up: the app ASKS instead of waiting silently

With location off, users had to discover the "Get my location" button, and nothing offered to turn on the phone's GPS. **Your request:** the app should ask.

```text
App opens → Get Started → "Use your location?"  [Not now]  [Turn on]
                                                    │          │
                                     location stays off        geo.turnOn():
                                     (button still works)        1. permission dialog (first time)
                                                                 2. phone GPS off? → Google's
                                                                    "Turn on location?" dialog
                                                                 3. live tracking starts
```

- `GeolocationService.turnOn()` = `start()` + "if the phone's Location is off, start a watch anyway". That watch is what makes Google Play Services show its one-tap turn-on dialog. It's used **only for user actions** (the question, Get my location, Tell me where I am, Try again). Automatic restarts still use `start()`, which never triggers the dialog. That prevents the endless dialog loop from Milestone 2 (C4).
- Settings → "Start location when the app opens" = on: skip the question and turn on directly.

### Follow-up 2: a modern sheet, and ask only until the user says yes

- The plain alert box was replaced by a **bottom sheet** (`shared/components/location-prompt/`): an Ionic sheet modal (`breakpoints [0, 1]`, `--height: auto`) with the logo, a title, two short points, a gradient **Turn on location** button and a quiet **Not now**. It can be swiped down (counts as Not now).
- **Remembered "yes":** after **Turn on location**, *if permission was actually granted*, the app sets `autoStart = true` (the Settings switch "Start location when the app opens"). Next launch: no sheet, location turns on directly.
- **"Not now" is not remembered:** the sheet appears again next launch.
- To be asked again, switch "Start location when the app opens" off in Settings.
- The component reports the choice through `(accepted)` / `(declined)`. Both buttons close the sheet the same way, and the choice is reported in `didDismiss`, so swiping or tapping outside also counts as "declined".

Tested on the emulator: sheet appears → Turn on location → tracking + announcement → restart → **no sheet**, location on automatically.

Tested on the emulator with the **phone's Location turned off** (previous version, alert box):
1. Open → Get Started → the question appears.
2. **Turn on** → Google's dialog → **Turn on** → phone Location enabled → coordinates + *"You are currently at Jollibee."*
3. Restart → **Not now** → 0 GPS calls, "Location is off".

Code:
- `GeolocationService`: `active` signal (did the user turn it on?), `stop()`, `autoStart` + `loadSettings()` / `setAutoStart()`
- `HomePage`: `toggleLocation()`, and `ngOnInit` starts only when `autoStart()` is on
- `LocationDetectionService`: resets when the fix becomes `null`

Tested on the emulator:
1. Open the app: **0 Geolocation calls**, "Location is off" panel.
2. Get my location: coordinates + "You are currently at Jollibee."
3. Stop location: screen cleared, **0 GPS calls** in the next 12 s.
4. Restart: still off, **0 calls**.

## 6. Known limitations (honest list)

- **Screen off means no detection.** Android pauses the app, so announcements only work while the app is open. A "pocket mode" needs a foreground service (future).
- **No "you left" announcement.** Only entering is spoken. Easy to add later if wanted.
- **Indoors:** accuracy is often 20–50 m, so small places (rooms) can't be detected. That's architecture.md §9, and Milestone 7 will handle rooms without GPS.

## 7. Review exercise

1. Why is `detect()` a pure function that receives `now` instead of calling `Date.now()` itself? What would the cooldown tests look like otherwise?
2. With radius 30 m and exit margin 10 m: you're inside, and readings come at 35 m, 38 m, 42 m, 44 m. On which reading does the app decide you left? (Remember the 2 confirmations.)
3. Why does the service read `store.locations()` with `untracked`? What would happen right after saving a place otherwise?
4. **Small change:** make the app also say *"You left Jollibee."* Where would you add it, and which setting would you respect?

## Done when

- [x] Saved places drawn on the map, current one green, tap to open
- [x] Automatic announcement once on entering (+ vibration), no repeats, no flip-flop
- [x] Accuracy gate, hysteresis, confirmations, cooldown, most-specific-wins
- [x] "Tell me where I am" prefers saved places
- [x] Settings switch for automatic announcements
- [ ] Tests 6–9 on a real phone
- [ ] Review exercise answered
