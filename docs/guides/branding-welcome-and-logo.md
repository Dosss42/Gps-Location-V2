# Guide: Logo, Brand Colors, Launcher Icon, and the Get Started Screen

Added between Milestones 3 and 4.

---

## 1. Why SVG for the logo

| | SVG (vector) | PNG (pixels) |
|---|---|---|
| Sharp at any size | ✅ | ❌ blurs when enlarged |
| File size | Tiny (it's text) | Larger |
| Editable | ✅ Change colors/shapes in code or a vector editor | ❌ Must be redrawn |
| Android launcher icon | Converted by Android Studio | ✅ Accepted directly |

**Rule:** the **SVG is the master file**. PNGs are *exported from it* only where a tool needs pixels.

## 2. The logo

**Concept:** a map pin (*where*) with sound waves (*spoken aloud*), on the brand gradient.

| File | Use |
|---|---|
| `src/assets/logo/logo.svg` | The full logo (rounded square + white glyph). Used on the Get Started screen and as the browser favicon. |
| `src/assets/logo/icon-foreground.svg` | Android adaptive-icon **foreground**: white glyph, transparent, scaled to 62% to stay inside the launcher's crop "safe zone" |
| `src/assets/logo/icon-background.svg` | Android adaptive-icon **background**: full-bleed gradient |
| `resources/logo.png`, `resources/icon-foreground.png`, `resources/icon-background.png` | 1024×1024 PNG exports of the three SVGs, for Android Studio. `resources/` is **not** bundled into the app. |

How the pin shape is built (in `logo.svg`):
- A circle of radius 110 plus two straight lines to the tip, touching the circle exactly at a tangent, so the outline is smooth.
- The hole is a second circle cut out using `fill-rule="evenodd"`.
- The waves are circle arcs around the pin head. The inner one is solid, the outer one is at 60% opacity.

The PNGs were exported with headless Chrome:

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --default-background-color=00000000 --window-size=1024,1024 --screenshot=resources\logo.png <html page showing the svg at 1024px>
```

If you edit an SVG, export its PNG again.

## 3. Brand colors

Defined once in `src/theme/variables.scss`:

```scss
:root {
  --app-brand-start: #1e88ff;   // blue
  --app-brand-end: #7b61ff;     // purple
  --app-brand-gradient: linear-gradient(135deg, var(--app-brand-start), var(--app-brand-end));
}
```

Also defined there: **`ion-button.brand-button`**, the gradient call-to-action style (`<ion-button class="brand-button">`).

### Reusable building blocks (added with the home restyle)

Also in `src/theme/variables.scss`, so every screen can share the same look:

| Class / variable | Look |
|---|---|
| `.panel` | Rounded box (16 px) with a subtle border. `--app-panel-background` / `--app-panel-border` change automatically in dark mode. |
| `.panel-label` | Small uppercase caption ("LATITUDE", "CURRENT ADDRESS") |
| `.panel-heading` + `.icon-badge` | A row with the orange gradient icon square |
| `ion-button.brand-button` | Gradient primary button |
| `ion-button.brand-outline-button` | Outlined secondary button, same rounded shape |

Global styles aren't limited by Angular's per-component style budget (a warning at 2 KB and an error at 4 KB per component in production builds), which is another reason shared styles live here.

### Home screen layout (matches the earlier app version)

1. **Coordinates panel:** big latitude/longitude (5 decimals ≈ 1 m), accuracy "±5 meters" in green, or red when worse than 30 m
2. **Current address panel:** orange pin badge, barangay as the big blue title, full address
3. **Map** (200 px, rounded): **always visible**, even with location off. It starts zoomed to fit your saved places, or the Philippines if there are none. When location turns on, it zooms to you (blue dot). Stop location removes the dot and keeps the map.
4. **Get my location** (gradient) and **Tell me where I am** (outline; turns into "Stop speaking")
5. **Shortcuts:** Save place · Saved places · Settings
6. ~~More GPS details~~: **removed**. Altitude, speed and heading don't help answer "where am I?" (phone altitude is often 10–30 m off; speed/heading only mean something while moving). The values are still in `PositionFix` if ever needed.
7. **Status line** with a colored dot: "Location available" (green), "Searching for GPS…" / "low accuracy" (orange), "Location is turned off" / "permission needed" (red). It replaced the temporary debug line.

### Light / dark mode

| Piece | How it works |
|---|---|
| Choice | Settings → **Appearance: System / Light / Dark** (default System). Quick **sun/moon button** in the home header switches between light and dark. |
| Saved | Key `theme` in the SQLite `settings` table, loaded at startup (`provideAppInitializer`) |
| `ThemeService` | Adds or removes the class `ion-palette-dark` on `<html>`. In System mode it listens to the phone's `prefers-color-scheme` and follows changes live. |
| `global.scss` | Imports Ionic's **`dark.class.css`** (dark palette only while that class is present). It used to be `dark.system.css`, which always followed the phone and gave no choice. |
| Own dark styles | Written as `:root.ion-palette-dark { … }` (panel colors) and `.ion-palette-dark app-location-map …` (dark map tiles), not with `@media (prefers-color-scheme: dark)` |
| Status bar | `StatusBar.setStyle()`: light icons on dark, dark icons on light, so the clock and battery stay visible |

Tested on the emulator with the phone in light mode: moon button → whole app dark (map too) → restart → still dark, status bar icons white. Settings shows "Dark" selected. 5 unit tests in `theme.service.spec.ts`.

**Map tile seams:** Android's WebView can leave hairline gaps between map tiles. Two common fixes were tried and didn't help: `mix-blend-mode: plus-lighter` (no effect), and 256.5 px tiles (made more lines appear). What worked: give the map background OpenStreetMap's land color (`#f2efe9`, and `#1f1d19` in dark mode), so any gap is the same color as the map.

## 4. Set the Android launcher icon (you do this once in Android Studio)

Android icons have two layers (background + foreground), and each launcher crops them into its own shape (circle, squircle…). Android Studio's **Image Asset** tool generates every size and shape from our PNGs.

1. `npx cap open android`
2. In the **Project** panel, right-click **app** → **New → Image Asset**.
3. **Icon type:** *Launcher Icons (Adaptive and Legacy)* · **Name:** `ic_launcher` (keep it).
4. **Foreground Layer** tab → Asset type **Image** → Path: `…\gps-location-v-2\resources\icon-foreground.png` · Trim: **No** · Resize: **100%** (the glyph is already sized for the safe zone).
5. **Background Layer** tab → Asset type **Image** → Path: `…\resources\icon-background.png`.
6. **Options** tab: Legacy icon **Yes**, Round icon **Yes**.
7. **Next** → Android Studio lists the files it will overwrite (the old Capacitor icon). That's intended → **Finish**.
8. ▶ Run, then look at the emulator's home screen and app drawer.

Check the preview circles in step 4: the waves must not touch the edge of the circle.

## 5. The Get Started screen

**Files:** `src/app/pages/welcome/`

**Why it exists:** it explains the app, and **why** it needs location, before anything happens. Android recommends explaining that before the permission dialog.

**Flow (current):**

```text
Every app start → route '' → redirectTo: 'welcome'
   "Get Started" → navController.navigateRoot('/home')   (location still OFF)
   "Get my location" on home → Android permission dialog (the user was told what to pick)
```

**History of this decision:**
1. First version: shown only on the first launch. A flag in `localStorage` (`OnboardingService`) remembered that "Get Started" was tapped, and a Settings button could show it again.
2. **Your decision:** show it **every time the app opens**. The flag, `OnboardingService` and the Settings button were removed (no dead code).

"Opening" means a fresh start (after closing it from recent apps, or a phone restart). Switching to another app and back returns to where you were, which is normal Android behaviour.

| Piece | Detail |
|---|---|
| `redirectTo: 'welcome'` | The empty route always goes to the welcome screen |
| `navigateRoot('/home')` | Ionic navigation that **clears history**, so the Android back button from home leaves the app instead of returning to Get Started |
| Privacy text | Updated in Milestone 9: saved places stay on the phone. Place names and the map come from OpenStreetMap when online. |

**Bug found during testing:** the feature icons were grey instead of blue. `.features span { color: medium }` (specificity: 1 class + 1 element) beat `.feature-icon { color: blue }` (1 class), because the icon box is also a `<span>`. The fix was to narrow the text rule to `div > span`.

## 6. Tested on the emulator

| Test | Result |
|---|---|
| Fresh install (`pm clear`) | ✅ Opens on Get Started: logo, 3 features, permission hint, gradient button |
| Tap Get Started | ✅ Home page, location off (permission is asked on "Get my location") |
| Relaunch the app | ✅ Shows Get Started again (every start) |
| Build / 10 unit tests / lint | ✅ |
| Launcher icon | ⏳ Your step (section 4) |
