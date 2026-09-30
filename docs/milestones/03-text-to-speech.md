# Milestone 3: Text-to-Speech

**Goal:** the app speaks. A **Speak** button reads out where you are, a **Stop** button silences it, and a **Settings** page controls language, speed, pitch and volume.

> Built by Claude with explanations ("I build it, you explain"). Read each part, then do the review exercise at the end.

| Part | Content | Status |
|---|---|---|
| A | Concepts: how Android speaks, choosing the plugin | ✅ |
| B | Plugin install, models, message builder + unit tests | ✅ |
| C | `SpeechService` (and the plugin trap we designed around) | ✅ |
| D | Home page Speak/Stop, new Settings page, folder move | ✅ |
| E | Testing on the emulator | ✅ Tests 1–7 pass · 8–11 are yours |

---

# Part A: Concepts

## A1. Where the voice comes from

```text
SpeechService.speak("You are at Building 1")
      ▼
@capacitor-community/text-to-speech plugin
      ▼
Android TextToSpeech API
      ▼
The phone's TTS engine (usually "Speech Services by Google")  ──► speaker
```

- The **engine** is a separate app on the phone. It owns the voices.
- A voice works **offline** only if its voice data is downloaded. English is usually preinstalled. Other languages, such as Filipino, may need **Settings → Text-to-speech → Install voice data** (or the app's "Install more voices" button).

## A2. Choosing the plugin

| Option | Verdict |
|---|---|
| Official Capacitor TTS plugin | **Doesn't exist** |
| Browser Web Speech API (`speechSynthesis`) | Works in desktop Chrome, **unreliable inside Android WebView** |
| **`@capacitor-community/text-to-speech` 8.0.2** | ✅ Chosen. Maintained, supports Capacitor 8, native Android engine, and falls back to Web Speech in the browser. |

## A3. Facts we checked in the plugin's source code (not only its README)

1. **No manifest change needed.** The plugin's own `AndroidManifest.xml` already declares the `TTS_SERVICE` lookup that Android 11+ requires, and Android merges it into ours.
2. `speak()` resolves **only when the sentence has finished**.
3. **The trap:** if a sentence is interrupted (by `stop()` or a newer `speak()`), the plugin throws its callback away. **The interrupted `speak()` promise never resolves or rejects.** Code that did `isSpeaking = true; await speak(); isSpeaking = false;` would leave `isSpeaking` stuck on `true` forever.
4. Errors are plain English messages, with no codes: `"This language is not supported."` and `"Not yet initialized or not available on this device."`.

**Lesson:** when behavior matters (here, "does this promise always settle?"), read the plugin's source. The README didn't mention point 3.

---

# Part B: Setup, models, messages

## B1. Install

```powershell
npm install @capacitor-community/text-to-speech@8.0.2 --save-exact
npx cap sync android
```

The sync now lists **6** plugins.

## B2. `src/app/core/models/speech.model.ts`

```ts
export interface SpeechSettings {
  lang: string;   // BCP 47 tag, e.g. 'en-US', 'fil-PH'
  rate: number;   // 1.0 normal, 0.5 half, 2.0 double
  pitch: number;  // 1.0 normal
  volume: number; // 0.0–1.0, relative to the phone's media volume
}
export const DEFAULT_SPEECH_SETTINGS = { lang: 'en-US', rate: 1.0, pitch: 1.0, volume: 1.0 };
```

## B3. `src/app/core/utils/announcement.utils.ts`: what the app says

This is kept **separate from the service**, so the wording can be tested and translated without touching plugin code.

| Function / constant | Output |
|---|---|
| `formatCoordinateForSpeech(16.0120000001)` | `"16.012"`: 5 decimals (~1 m), no trailing zeros |
| `buildUnknownLocationMessage(fix)` | "I could not identify this location. Your current coordinates are latitude 16.012 and longitude 120.357." |
| `buildUnknownLocationMessage(fix, 30)` with a 183 m fix | …plus "GPS accuracy is low, about 183 meters." |
| `NO_LOCATION_MESSAGE` | "I don't have your location yet. Please wait for the GPS signal and try again." |

For now **every** Speak uses the "could not identify" message, because there are no saved locations yet. Milestones 4–5 add "You are currently at Building 1."

## B4. First real unit tests: `announcement.utils.spec.ts`

Six Vitest tests cover rounding, trailing zeros, negative coordinates, the exact sentence, and the accuracy warning appearing or not appearing. They run on the PC in milliseconds, with no phone:

```powershell
npx ng test --watch=false
```

A small `makeFix()` helper builds fake `PositionFix` objects. This is the payoff of having our own model type (Milestone 2, B3 question a).

---

# Part C: `SpeechService`

**File:** `src/app/core/services/speech.service.ts`. It's the only file that imports the TTS plugin.

| Member | Purpose |
|---|---|
| `settings`, `isSpeaking`, `languages`, `errorMessage` | Read-only signals, same pattern as `GeolocationService` |
| `speak(text)` | Speaks with the current settings, `QueueStrategy.Flush` (a new message interrupts the old one: the newest location is the one that matters) |
| `stop()` | Silences immediately |
| `updateSettings(changes)` / `resetSettings()` | Changes settings (`Partial<SpeechSettings>` = "any subset of the fields") |
| `loadLanguages()` | Asks the engine which languages it supports |
| `openVoiceInstaller()` | Android only: opens the system screen to download voices |

## C1. How the "never-resolving promise" trap is solved

Every `speak()` and `stop()` call increases a counter, `utteranceNumber`. A `speak()` call remembers its own number and **only touches `isSpeaking` if its number is still the latest**:

```text
speak("A")  → number 1, isSpeaking = true
stop()      → number 2, isSpeaking = false       ("A" never resolves — and that's fine)
speak("B")  → number 3, isSpeaking = true
"B" finishes → its number (3) is still current → isSpeaking = false ✔
```

`stop()` sets `isSpeaking = false` itself instead of waiting for the interrupted `speak()`.

## C2. Error messages

`toSpeechErrorMessage()` turns the plugin's English messages into advice for the user, e.g. *The voice for "fil-PH" is not installed. Choose another language in Settings, or install the voice.* It matches on message text because the plugin has no error codes.

## C3. Settings are in memory for now

They reset when the app restarts. **Milestone 4** stores them in the SQLite `settings` table (architecture.md §7). The Settings page says this openly.

---

# Part D: Pages

## D1. Folder move: `src/app/home/` → `src/app/pages/home/`

This matches the planned architecture (architecture.md §4): all pages live in `pages/`. It was moved with `git mv`, so git keeps the file history. `app.routes.ts` and the import paths were updated (`../core/…` became `../../core/…`).

## D2. Home page changes

- **Speak** (large, blue) turns into a red **Stop** while speaking: `@if (speech.isSpeaking())`.
- **`speakLocation()`**: `geo.getFreshFix()` → build message → `speech.speak()`.
- **Refresh now** (outline) and **Settings** (text button, `routerLink="/settings"`).
- A yellow card shows speech errors.
- Icons come from `ionicons`. Standalone Ionic requires registering them first with `addIcons({...})` in the constructor.

**New in `GeolocationService`:** `getFreshFix(maxAgeMs = 10_000)` returns the latest fix if it's under 10 s old, otherwise requests a new one. Speak feels instant when GPS is already tracking, and it'll be reused by **Save Current Location** in Milestone 4.

## D3. Settings page (`src/app/pages/settings/`)

| Control | Details |
|---|---|
| Language | `ion-select` with `interface="modal"` (the list is long). Names come from the browser's built-in `Intl.DisplayNames` ("fil-PH" → "Filipino (Philippines) · fil-PH"), **sorted by name**. |
| Speed | Slider 0.5–2.0 (step 0.1), label shows e.g. `1.5×` |
| Pitch | Slider 0.5–2.0 |
| Volume | Slider 0–100% |
| Test voice / Stop | Speaks a sample sentence |
| Reset to defaults · Install more voices (Android) | |

The sliders use `(ionInput)`, which fires **while dragging**, so the label updates live. A single `onSliderInput('rate' | 'pitch' | 'volume', event)` handles all three. `SliderSetting = keyof Pick<SpeechSettings, 'rate' | 'pitch' | 'volume'>` makes TypeScript reject any other name.

## D4. Unit-test fix

`home.page.spec.ts` failed after adding the Settings button: `NG0201: No provider found for ActivatedRoute`. `RouterLink` needs a router. The real app gets one from `main.ts`, but the test didn't, so the test now uses `providers: [provideRouter([])]`. `settings.page.spec.ts` was added the same way.

---

# Part E: Testing

| # | Test | Result |
|---|---|---|
| 1 | Build, 9 unit tests, lint | ✅ All pass |
| 2 | Speak on emulator (location 16.012, 120.357) | ✅ Logcat: Google TTS synthesized *"I could not identify this location. Your current coordinates are latitude 16.012 and longitude 120.357."* in en-US |
| 3 | Button state while speaking | ✅ Turns into red **Stop**, returns to **Speak** when the sentence ends |
| 4 | Stop in the middle of a sentence | ✅ Voice stops, button returns to **Speak** immediately (the C1 design works) |
| 5 | Settings page opens | ✅ Language "American English · en-US", sliders at 1.0× / 1.0 / 100% |
| 6 | Speed 1.5× → Test voice | ✅ Plugin received `"rate":1.5` |
| 7 | Language list | ✅ Loads dozens of engine languages with readable names |

**Side note from testing:** the emulator had been running for about 10.5 hours and became unstable: black screen, and its NFC/UWB system services crashing every few seconds (`android.hardware.uwb … panicked`). **That wasn't our app.** A restart fixed it (Device Manager → ⋮ → Cold Boot Now, or `adb -s emulator-5554 reboot`). After a restart, send the fake location again.

**Your turn:**

| # | Test | Expected | Result |
|---|---|---|---|
| 8 | Open the language list and look for **Filipino (Philippines)** | Present or absent, depending on installed voice data. Note which. | |
| 9 | Pick Filipino → Test voice | The English sentence read with a Filipino voice, **or** the yellow "voice not installed" message | |
| 10 | Real phone: Speak outdoors | Hear your real coordinates. Is the sentence understandable? Too fast? | |
| 11 | Restart the app after changing speed | Speed is back to 1.0× (expected until Milestone 4) | |

---

## Review exercise

1. Why is `buildUnknownLocationMessage()` in `utils/` and not inside `SpeechService`? Give two reasons.
2. Trace C1 yourself: what would go wrong if `stop()` did **not** increase `utteranceNumber`? Describe what the user would see.
3. Why does Speak call `getFreshFix()` instead of `getCurrentFix()`? When would the two behave the same?
4. **Small code change:** add a **"Slow"** preset button on the Settings page that sets speed to `0.75`. Which file(s) do you touch, and which existing method do you call? (One line of HTML is enough.)

## Done when

- [x] Plugin installed and synced
- [x] `SpeechService` with speak/stop/settings/languages, interruption-safe
- [x] Speak button on home, Stop while speaking
- [x] Settings page: language, speed, pitch, volume, test voice
- [x] Message builder with unit tests
- [ ] Tests 8–11 done
- [ ] Review exercise answered
- [ ] Committed (together with Milestone 2 if not committed yet)
