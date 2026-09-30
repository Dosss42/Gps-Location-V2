# Milestone 2: GPS

**Goal:** the app asks for location permission correctly, shows your live latitude, longitude and accuracy, and handles every "can't get location" situation with a clear message.

| Part | Content | Status |
|---|---|---|
| A | Concepts: how Android location works, permissions, the plugin API | ✅ |
| B | Install the plugin, Android manifest, position model | ✅ |
| C | `GeolocationService`: permission logic, one-shot fix, live updates | ✅ |
| D | Home page UI | ✅ |
| E | Testing on the emulator (fake GPS, Location off) | ✅ Tests 1–6 pass · tests 7–11 are yours |

> Parts B–D were built by Claude with explanations (your choice: "I build it, you explain"). The B3/B4 solutions below match the code in the repo. Use the review exercise at the end to check your understanding.

---

# Part A: Concepts

## A1. Where does "location" come from on Android?

```text
 GPS satellites ─┐
 Wi-Fi networks ─┼──► Fused Location Provider (Google Play Services) ──► our plugin ──► our app
 Cell towers  ───┘         combines sources, picks the best available
                          (fallback: Android's older LocationManager)
```

- **GPS** is the most precise outdoors (3–10 m). It doesn't need internet, but the first fix can be slow.
- **Wi-Fi and cell** are faster and work indoors, but are less precise (15–50 m+).
- The **Fused Location Provider** mixes these automatically. `@capacitor/geolocation` uses it on Android. If Play Services fails, it falls back to `LocationManager` (option `enableLocationFallback`, default `true`).

**What "accuracy: 8" means:** Android reports accuracy as a radius in meters. There's about a **68% chance** the true position is within 8 m of the reported point. It isn't a guarantee: about 1 in 3 readings can be outside that circle. This is why the app later needs hysteresis and confirmations.

## A2. Android location permissions

Two permissions are declared in `AndroidManifest.xml`:

| Permission | Meaning |
|---|---|
| `ACCESS_COARSE_LOCATION` | Approximate location (about 2 km, deliberately blurred) |
| `ACCESS_FINE_LOCATION` | Precise location (GPS level) |

Since Android 12, the permission dialog lets the user choose **Precise** or **Approximate**, and **While using the app**, **Only this time**, or **Don't allow**.

**Asking twice rule:** if the user taps "Don't allow" twice, Android **stops showing the dialog** for this app. After that, the only way to grant it is the phone's **Settings → Apps → Where Am I → Permissions**. The app must detect this and explain it, instead of pressing a button that silently does nothing.

We **don't** declare `ACCESS_BACKGROUND_LOCATION`. This app only reads location while it's open (see architecture.md §12).

## A3. The plugin API (`@capacitor/geolocation` 8.2.2)

Five methods:

| Method | What it does |
|---|---|
| `checkPermissions()` | Returns the current permission state **without** showing a dialog. **Throws if the phone's Location is turned off.** |
| `requestPermissions()` | Shows the system permission dialog (if Android still allows it). **Not available on web.** |
| `getCurrentPosition(options)` | Gets **one** position (a "one-shot fix") |
| `watchPosition(options, callback)` | Calls `callback` **repeatedly** with new positions. Returns a watch ID. |
| `clearWatch({ id })` | Stops a watch. **Always do this when you no longer need updates** (battery). |

### What `checkPermissions()` returns

```ts
{ location: PermissionState, coarseLocation: PermissionState }
// PermissionState = 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied'
```

- `location` covers **fine + coarse** (precise).
- `coarseLocation` covers only coarse (approximate).

| Value | Meaning on Android |
|---|---|
| `'prompt'` | Never asked, so the dialog can be shown |
| `'prompt-with-rationale'` | The user said no once. The dialog can still be shown, but Android recommends **explaining why first**. |
| `'granted'` | Allowed |
| `'denied'` | Android won't show the dialog anymore, so the user must go to Settings |

> We'll **verify** this table on the emulator in Part E by denying twice and watching the values change. Don't trust documentation (or AI) without testing.

### What a position looks like

```ts
{
  timestamp: number,               // ms since 1970-01-01 (Unix epoch)
  coords: {
    latitude: number,              // degrees
    longitude: number,             // degrees
    accuracy: number,              // meters (68% radius)
    altitude: number | null,       // meters, null if unavailable
    altitudeAccuracy: number | null,
    speed: number | null,          // meters per SECOND
    heading: number | null,        // degrees clockwise from north
    // + iOS-oriented extras: magneticHeading, trueHeading, headingAccuracy, course
  }
}
```

Note the `| null`. Altitude, speed and heading **may not exist**. TypeScript forces us to handle that.

### Options we'll use

| Option | Meaning | Our value | Why |
|---|---|---|---|
| `enableHighAccuracy` | Use GPS, not only Wi-Fi/cell | `true` | We need building-level precision. Ignored if the user granted only Approximate. |
| `timeout` | Max wait (ms) for a position | `20000` | The default 10 s is too short for a cold GPS start |
| `maximumAge` | Accept a cached position this old (ms) | `0` for Speak, a few seconds for the first display | `0` = fresh fixes only |
| `interval` (Android) | Desired update interval for `watchPosition` | `5000` | Walking ≈ 1.4 m/s, so about 7 m between updates. Tunable. |
| `minimumUpdateInterval` (Android) | Never deliver faster than this | `2000` | Avoids flooding the app |

### Errors we must handle (Android)

| Code | Meaning | Message for the user |
|---|---|---|
| `OS-PLUG-GLOC-0003` | Permission denied | Explain why location is needed, offer Retry or Settings |
| `OS-PLUG-GLOC-0007` | Location services turned off | "Turn on Location in your phone's quick settings" |
| `OS-PLUG-GLOC-0009` | User refused the "enable location" prompt | Same as above |
| `OS-PLUG-GLOC-0010` | Timed out | "Still searching… move to an open area" |
| `OS-PLUG-GLOC-0017` | Network **and** Location both off | Same as 0007 |
| `OS-PLUG-GLOC-0002` | Generic failure | "Could not get location, try again" |

## A4. One-shot vs. watching

| | `getCurrentPosition` | `watchPosition` |
|---|---|---|
| Returns | One position (Promise) | Many positions (callback) |
| Use in this app | **Speak** button, **Save Current Location** | Live display, automatic detection (Milestone 6) |
| Battery | Low | High, so stop it when leaving the screen or when the app is in the background |

## A5. Why we'll store GPS data in Angular **signals**

Your project is **zoneless**: `zone.js` isn't in `package.json`, and Angular 22 is zoneless by default. In a zoneless app, Angular **doesn't automatically notice** when a plain class property changes inside a plugin callback. The screen wouldn't update.

A **signal** is a value that tells Angular "I changed, re-render whatever uses me":

```ts
fix = signal<PositionFix | null>(null);   // create
fix.set(newFix);                          // update → UI refreshes
fix()                                     // read (in TS or in the template)
```

That's why `GeolocationService` (Part C) will expose its state as signals.

---

# Part B: Setup and the model

## B1. Install the plugin

```powershell
npm install @capacitor/geolocation@8.2.2 --save-exact
npx cap sync android
```

- `--save-exact` pins the version, like `@capacitor/android`.
- **`cap sync` is required**: it registers the plugin's native Android code. Forgetting it causes "plugin not implemented" errors.
- Expected: the sync output lists **5** Capacitor plugins, including `@capacitor/geolocation@8.2.2`.

## B2. Declare permissions in the Android manifest

**File:** `android/app/src/main/AndroidManifest.xml`

Find the `<!-- Permissions -->` section at the bottom (it already contains `INTERNET`) and add the location lines **below** it, still inside `<manifest>`:

```xml
    <!-- Permissions -->

    <uses-permission android:name="android.permission.INTERNET" />

    <!-- Geolocation Plugin -->
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-feature android:name="android.hardware.location.gps" />
</manifest>
```

What each line does:
- **Both permissions are required.** Android 12+ needs COARSE declared alongside FINE, so the user can choose "Approximate".
- **`<uses-feature … gps />`** tells Google Play "this app needs GPS hardware", so it isn't offered on devices without GPS. That's correct for this app. The line is optional and doesn't affect how the app runs.
- If you forget the two `uses-permission` lines, the plugin throws error **`OS-PLUG-GLOC-0018`** ("permissions are not declared in manifest").
- **Keep `INTERNET`.** Live reload needs it, and Milestone 9 might too. GPS itself doesn't.

> **Nothing changes on screen during Part B.** B1–B4 are plugin setup, permissions and types. The coordinates first appear on the home page in **Part D**. Test on the **Android emulator**, not the browser preview (`ionic serve` / VS Code preview, the iPhone-shaped frame): there, GPS comes from the PC's browser and `requestPermissions()` isn't available.

## B2.5 Smoke test: prove the plugin works, with no app code

After B1 + B2:
1. Press **▶ Run** in Android Studio. Manifest changes need a reinstall.
2. Emulator: **⋮ (Extended controls) → Location →** choose a spot → **Set Location**.
3. Desktop Chrome: `chrome://inspect/#devices` → **inspect** under the app → **Console**.
4. Type:

```js
await Capacitor.Plugins.Geolocation.checkPermissions()
// → { location: 'prompt', coarseLocation: 'prompt' }   (never asked yet)

await Capacitor.Plugins.Geolocation.requestPermissions()
// dialog appears on the emulator → choose Precise + While using the app
// → { location: 'granted', coarseLocation: 'granted' }

await Capacitor.Plugins.Geolocation.getCurrentPosition({ enableHighAccuracy: true })
// → { timestamp: ..., coords: { latitude: <what you set>, longitude: ..., accuracy: ... } }
```

`window.Capacitor.Plugins` gives direct access to native plugins, which is handy for experiments. **App code must never do this.** The app imports the plugin in `GeolocationService` so it's typed and testable.

If `getCurrentPosition` fails, compare the error code with the table in A3. Most likely the emulator's Location toggle is off (0007), or no location was set in Extended controls (0010, timeout).

## B3. Exercise: design the position model

The plugin's `Position` type has iOS extras, a nested `coords` object, and names we don't control. We'll convert it into **our own interface** once, inside the service. Every other part of the app then uses our type.

**Create the file:** `src/app/core/models/position.model.ts` (create the `core/models/` folders too).

**Your task:** write these three types yourself before looking at the solution.

1. **`PositionFix`**: one GPS reading with the fields the app needs: latitude, longitude, accuracy, altitude, altitude accuracy, speed, heading, timestamp.
   - Think: which ones can be missing, and what type expresses "missing"?
   - Add a short comment with the **unit** of each field.
2. **`LocationPermission`**: a union type of string literals describing the permission situation **from our app's point of view**. Hint: the app needs to show different screens for "never asked", "precise granted", "approximate only", "said no but can ask again", "blocked, must use Settings", plus "not checked yet".
3. **`GpsStatus`**: what the GPS side is doing: not started, waiting for the first fix, receiving updates, phone's Location is off, some other error.

Questions to answer in a comment or to me:
- a) Why not just use the plugin's `Position` type everywhere?
- b) Why use `number | null` instead of making the field optional (`altitude?: number`)?

## B4. Exercise: map plugin states to *our* states

Part C's permission function is this table turned into code. Fill in the right column using your `LocationPermission` values:

| `location` | `coarseLocation` | Our `LocationPermission` |
|---|---|---|
| `granted` | `granted` | ? |
| `denied` or `prompt-with-rationale` | `granted` | ? |
| `prompt` | `prompt` | ? |
| `prompt-with-rationale` | `prompt-with-rationale` | ? |
| `denied` | `denied` | ? |
| *`checkPermissions()` throws* | | ? (hint: it isn't a permission problem, which type does it belong to?) |

<details><summary>Solution B3: try it first!</summary>

```ts
/**
 * One GPS reading in the app's own format.
 * The plugin's Position is converted into this once, in GeolocationService.
 */
export interface PositionFix {
  /** Degrees, -90 (south) to 90 (north). */
  latitude: number;
  /** Degrees, -180 (west) to 180 (east). */
  longitude: number;
  /** Meters. ~68% chance the true position is within this radius. */
  accuracy: number;
  /** Meters above sea level (WGS84 ellipsoid), or null if unavailable. */
  altitude: number | null;
  /** Meters, or null if unavailable. */
  altitudeAccuracy: number | null;
  /** Meters per second, or null if unavailable. */
  speed: number | null;
  /** Degrees clockwise from true north (0–360), or null if unavailable. */
  heading: number | null;
  /** Milliseconds since 1970-01-01 UTC (Unix epoch). */
  timestamp: number;
}

/** The permission situation, from the app's point of view. */
export type LocationPermission =
  | 'unknown'      // not checked yet
  | 'prompt'       // never asked: we may show the system dialog
  | 'granted'      // precise location allowed
  | 'approximate'  // only approximate location: place detection won't work
  | 'denied'       // user said no, but we may ask again (explain why first)
  | 'blocked';     // Android won't show the dialog: user must use Settings

/** What the GPS side is currently doing. */
export type GpsStatus =
  | 'idle'          // not started
  | 'locating'      // waiting for the first fix
  | 'tracking'      // receiving updates
  | 'services-off'  // the phone's Location toggle is off
  | 'error';        // any other failure (message stored separately)
```

**a)** Isolation. If the plugin changes its shape, or we switch plugins, only the service's converter changes. It also makes it easy to create fake `PositionFix` objects in unit tests (Milestones 5–6) without the plugin.

**b)** `number | null` means "this field is always present, and its value may be 'no data'". The plugin itself uses `null`, so the conversion is 1-to-1. An optional field (`?`) means "the field might not exist at all", which is a different meaning and makes it easy to forget a field when creating objects.
</details>

<details><summary>Solution B4</summary>

| `location` | `coarseLocation` | Our state |
|---|---|---|
| `granted` | `granted` | `granted` |
| `denied` / `prompt-with-rationale` | `granted` | `approximate` |
| `prompt` | `prompt` | `prompt` |
| `prompt-with-rationale` | `prompt-with-rationale` | `denied` (can ask again, explain first) |
| `denied` | `denied` | `blocked` (Settings only) |
| throws | | Not a permission state: it's **`GpsStatus = 'services-off'`** |

Order matters in code: check `granted` first, then `approximate`, then the rest.
</details>

---

# Part C: `GeolocationService`

**File:** `src/app/core/services/geolocation.service.ts`. It's **the only file that imports `@capacitor/geolocation`.**

## C1. Shape of the service

```text
                 ┌───────────────── GeolocationService ─────────────────┐
 HomePage ──────►│ start() · checkPermission() · requestPermission()    │──► @capacitor/geolocation
 (calls)         │ getCurrentFix() · startWatching() · stopWatching()   │
                 │                                                      │
 HomePage ◄──────│ signals (read-only): permission · status · fix ·     │
 (reads)         │                      errorMessage · hasPermission    │
                 └──────────────────────────────────────────────────────┘
```

**Private writable, public read-only signals.** `_fix = signal(...)` is private, and `fix = _fix.asReadonly()` is public. Pages can **read** the state but can't **change** it, so there's exactly one place where GPS state changes.

`hasPermission` is a **`computed`** signal: a value derived from other signals that recalculates automatically when `permission` changes.

## C2. The methods

| Method | What it does | Used by |
|---|---|---|
| `start()` | The full sequence: check permission → if never asked, ask → if allowed, start watching. **Stops early if Location is off** (see C4). Safe to call repeatedly. | Page startup, app resume, Try again |
| `checkPermission()` | Calls `checkPermissions()` and converts the result with `toLocationPermission()` (your B4 table). If it throws, Location is off, so status becomes `services-off`. | `start()` |
| `requestPermission()` | Native: shows the Android dialog. Web: `requestPermissions()` doesn't exist, so it requests one position to make the **browser** show its prompt. | `start()`, "Allow location" button |
| `getCurrentFix()` | One fresh reading (`maximumAge: 0`). Returns `PositionFix` or `null`. | "Refresh now" now, Speak/Save later |
| `startWatching()` | Starts `watchPosition`. Each callback delivers either a position (→ `acceptPosition`) or an error (→ `handleError`). Does nothing if already watching. | `start()` |
| `stopWatching()` | `clearWatch`, so battery stops draining | App pause, leaving the page |
| `acceptPosition()` *(private)* | Converts to `PositionFix`, stores it, sets status `tracking`, clears errors | Both one-shot and watch |
| `handleError()` *(private)* | Reads the error code, sets status (`services-off` or `error`) and a friendly message. On `0003` it re-checks permission so the right help card appears. | Everything |

**Pure helper functions** at the bottom of the file are exported so they can be unit-tested later without a phone:
- `toLocationPermission(status)`: the B4 table
- `toPositionFix(position)`: plugin shape → our shape. `?? null` turns a missing value into `null`.
- `getErrorCode(error)`: safely reads `error.code`. Errors are typed `unknown`, so we **check before using**.

## C3. Why `watchId` is a Promise, not a string

`watchPosition()` returns `Promise<string>`, and the ID only arrives after the native side starts. If the user leaves the page **before** that happens and we stored a plain string, `stopWatching()` would find nothing to clear and the watch would leak. Storing the **Promise** means `stopWatching()` can `await` it and always gets the ID.

## C4. The bug we found while testing: endless "Turn on location" dialog

In the first version, `start()` ignored "Location is off" and started a watch anyway. On the emulator this happened:

```text
watch starts → Location off → Google Play Services shows "Turn on location?" dialog
  → dialog covers the app → Android sends 'pause'  → we stop the watch
  → user taps "No thanks"  → Android sends 'resume' → start() → new watch
  → dialog again → … forever
```

**Fix:**
1. `start()` returns early when `checkPermission()` reports `services-off`.
2. `checkPermission()` resets `services-off` → `idle` when the check succeeds (Location was turned back on).
3. Only the **user's tap** on "Try again" may start a watch while Location is off. That shows Google's one-tap "Turn on" dialog **once**.

**Lesson:** lifecycle events (`pause`/`resume`) fire for **system dialogs too**, not only when the user switches apps. Any "restart on resume" logic must not itself cause a dialog.

---

# Part D: The home page

**Files:** `src/app/home/home.page.ts`, `home.page.html`, `home.page.scss`

## D1. `home.page.ts`: lifecycle and buttons

| Code | Purpose |
|---|---|
| `geo = inject(GeolocationService)` | Gets the one shared service instance (`providedIn: 'root'`) |
| `ACCEPTABLE_ACCURACY_M = 30` | Threshold for "accuracy too low". **A starting guess**: tune it by walking the real campus. Moves to Settings in Milestone 6. |
| `isAccuracyPoor = computed(...)` | `true` when the latest fix is worse than the threshold |
| `ngOnInit()` | Registers `App` **pause** → `stopWatching()` and **resume** → `start()`, then calls `start()` |
| `ngOnDestroy()` | Removes listeners, stops watching (cleanup) |
| `allowLocation()` / `tryAgain()` / `refresh()` | The three buttons |

Why resume calls `start()`, not just `startWatching()`: the user may have gone to **Settings** and changed the permission. `start()` re-checks first.

> **Later:** in Milestone 6, automatic detection must run no matter which page is open, so this pause/resume handling will move from the page into a service.

## D2. `home.page.html`: what the user sees

Built with Angular's control flow (`@if`, `@switch`):

| Block | Shows when |
|---|---|
| Yellow card + **Allow location** | `permission === 'denied'` (said no once, can ask again) |
| Red card with Settings steps | `permission === 'blocked'` (Android won't ask again) |
| Yellow card "Precise location is off" | `permission === 'approximate'` |
| Red card + **Try again** | `errorMessage()` isn't null |
| Current Location list | `fix()` exists: latitude/longitude (6 decimals ≈ 0.1 m), accuracy (green or red), altitude, speed (m/s × 3.6 = km/h), heading, time |
| Spinner "Searching for GPS signal…" | No fix yet and `status === 'locating'` |
| **Refresh now** | Always, disabled without permission |
| Small grey debug line | Always, **for learning**: shows `permission` and `status` live. Remove later. |

`@if (geo.fix(); as fix)` reads the signal **once** and names the result `fix`. Inside the block, TypeScript knows `fix` isn't null. The same goes for `@if (fix.altitude !== null)`.

---

# Part E: Testing (done on the Pixel 8 emulator)

| # | Test | How | Result |
|---|---|---|---|
| 1 | First launch asks permission | Fresh install (`adb shell pm clear www.gpslocationv2.whereami`) | ✅ Android dialog: Precise/Approximate, While using / Only this time / Don't allow |
| 2 | Coordinates appear | Emulator location set to 16.0120, 120.3570 (Calasiao) → "While using the app" | ✅ Lat 16.012000, Lng 120.356998, accuracy 5 m (green), `permission: granted · status: tracking` |
| 3 | Live updates | Moved emulator ~110 m north (16.0130) without touching the app | ✅ Screen updated by itself within ~5 s |
| 4 | Location turned off | Emulator Location toggle off → relaunch | ✅ (after the C4 fix) Red card "Location is turned off…", `status: services-off`, no dialog loop |
| 5 | Recovery | Location on → **Try again** | ✅ Back to `tracking` with coordinates |
| 5b | Browser preview (`ionic serve`) | Opened the app in the PC browser | ✅ Real coordinates from Wi-Fi/IP positioning, accuracy **183 m in red** (correct: a PC has no GPS), altitude/speed/heading "Not available". Found `status: locating` shown while a fix existed; fixed so `startWatching()` keeps `tracking` when a fix is already present. |
| 6 | Build / unit tests / lint | `npm run build`, `npx ng test --watch=false`, `npx ng lint` | ✅ All pass |

**Your turn: remaining tests** (write the results here):

| # | Test | How | Expected | Result |
|---|---|---|---|---|
| 7 | Deny once | Fresh install → **Don't allow** | Yellow card + "Allow location" button, `permission: denied` | |
| 8 | Deny twice | Tap "Allow location" → **Don't allow** again | Red "blocked" card with Settings steps, `permission: blocked` | |
| 9 | Fix from Settings | Settings → Apps → Where Am I → Permissions → Location → Allow while using → return to app | Coordinates appear by themselves (resume → `start()`) | |
| 10 | Approximate | Fresh install → choose **Approximate** | Yellow "Precise location is off" card, accuracy in km range | |
| 11 | Real phone | Run on your phone outdoors, then indoors | Outdoors: accuracy under 10–15 m. Indoors: worse, maybe red. **Write down the real numbers**: they decide the threshold later. | |

Resetting the app to "never asked" between tests:

```powershell
adb -s emulator-5554 shell pm clear www.gpslocationv2.whereami
```

Setting the emulator's location from the terminal (note: **longitude first**):

```powershell
adb -s emulator-5554 emu geo fix 120.3570 16.0120
```

---

## Review exercise (after reading Parts C and D)

Answer in your own words:

1. In `geolocation.service.ts`, why are `_fix` and the other writable signals `private`? What could go wrong if the home page could call `fix.set(...)`?
2. What happens, step by step, when you press the phone's **Home** button while the app is tracking, then open the app again? Name the methods that run.
3. The emulator test showed `Altitude: 0 m` and `Heading: 357°`. Are these real measurements? (Hint: what does an emulator actually know?)
4. **Small code change:** make the accuracy line show the threshold, e.g. `5 m (limit 30 m)`. Which file do you edit, and which existing property do you use?

## Done when

- [x] Plugin installed and synced, manifest permissions added
- [x] `PositionFix`, `LocationPermission`, `GpsStatus` models
- [x] `GeolocationService` with permission handling, one-shot and watch, error messages
- [x] Home page shows live latitude, longitude, accuracy (+ altitude/speed/heading/time)
- [x] Location-off handled without a dialog loop
- [ ] Tests 7–11 done and results written above
- [ ] Review exercise answered
- [ ] Committed: `git commit -m "Milestone 2: GPS permissions and live location"`
