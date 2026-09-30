# Milestone 2: GPS

**Goal:** the app asks for location permission correctly, shows your live latitude, longitude and accuracy, and handles every "can't get location" situation with a clear message.

| Part | Content | Status |
|---|---|---|
| A | Concepts: how Android location works, permissions, the plugin API | ✅ Written |
| B | Install the plugin, Android manifest, position model (exercise) | ✅ Written, your turn |
| C | `GeolocationService`: permission logic, one-shot fix, live updates | ⏳ Next |
| D | Home page UI | ⏳ |
| E | Testing on the emulator (fake GPS, deny permission, Location off) | ⏳ |

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

## Part C preview (next session)

`src/app/core/services/geolocation.service.ts` will contain:
- signals: `permission`, `status`, `fix`, `errorMessage`
- `checkPermission()` / `requestPermission()`: your B4 table as code, with web handled separately
- `getCurrentFix()`: one-shot, for Speak / Save
- `startWatching()` / `stopWatching()`: live updates, cleaned up correctly
- `toPositionFix()`: plugin `Position` → your `PositionFix`
- `toFriendlyError()`: error codes → the messages in A3
