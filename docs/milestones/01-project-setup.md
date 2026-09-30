# Milestone 1: Project Setup

**Goal:** the blank Ionic app runs as a real Android app on a phone or emulator, and you can debug it.

---

## 1. Environment check

Checked on the development machine (Windows 11) on 2026-09-30:

| Requirement | Found | Status |
|---|---|---|
| Node.js | v26.2.0, npm 11.13 | ✅ |
| JDK | Oracle JDK 21.0.12, `JAVA_HOME` set | ✅ Capacitor 8 needs JDK 21 |
| Android Studio | Installed, with bundled JDK 21 (JBR) | ✅ |
| `ANDROID_HOME` | `C:\Users\ron28\AppData\Local\Android\Sdk` | ✅ |
| SDK platforms | android-36, android-37 | ✅ |
| Build tools / adb | 35, 36 / on PATH | ✅ |
| Emulator | `Pixel_8` | ✅ |
| Ionic CLI | 7.2.1 | ✅ |
| `@capacitor/android` | not installed | ⏳ Step 3 |

`ANDROID_SDK_ROOT` isn't needed. It's the old name for `ANDROID_HOME`.

Commands to re-check the environment yourself:

```powershell
node -v
java -version
echo $env:JAVA_HOME
echo $env:ANDROID_HOME
adb devices
npx cap doctor
```

## 2. How the pieces fit together

```text
 src/ (TypeScript, HTML, SCSS)
      │  npm run build     (Angular compiles your app)
      ▼
 www/  (plain HTML/JS/CSS)             ← "webDir" in capacitor.config.ts
      │  npx cap sync android   (copies www + registers native plugins)
      ▼
 android/  (a REAL Android Studio project)
      │  app/src/main/assets/public/  ← your web app lives here
      │  MainActivity = a full-screen WebView that loads it
      ▼
 .apk installed on phone / emulator
```

Key points:
1. **The app is a website running inside a native shell.** Capacitor plugins are the bridge from JavaScript to native Android code.
2. **Editing `src/` doesn't change the phone app** until you build and sync again.
3. **`android/` is source code, not build output.** You'll edit `AndroidManifest.xml` in Milestone 2, so it's committed to git.

## 3. Steps

### Step 1: App identity

The `appId` is the app's permanent, globally unique Android package name. It can't change after publishing to the Play Store.

Rules:
- reverse-domain style, lowercase by convention
- dot-separated segments
- each segment starts with a letter
- only letters, digits and `_` (it becomes a Java package name)

**Exercise:** which are valid, and which are a bad idea?

```text
a) com.ron.where-am-i
b) com.2026.whereami
c) io.ionic.starter
d) com.dosss42.whereami
```

<details><summary>Answer</summary>

- a) Invalid: hyphens aren't allowed in Java package names.
- b) Invalid: a segment starts with a digit.
- c) Valid but **bad**: every Ionic tutorial app uses it. Installing another one would overwrite this app on the phone.
- d) Valid and unique. Good.
</details>

**Edit `capacitor.config.ts`:**
- `appId`: your own ID, for example `com.<yourname>.whereami`
- `appName`: `'Where Am I?'` (the name under the icon)
- Keep `webDir: 'www'`. It must match Angular's build output folder.

Optional: set `<title>Where Am I?</title>` in `src/index.html` (browser tab only).

> Do this **before** Step 3. `cap add android` uses the appId as the Java package name, and renaming it afterwards is tedious.

### Step 2: Build the web app

```powershell
npm run build
```

`www/` must exist before Android is added, because Capacitor copies it into the native project.

### Step 3: Add the Android platform

```powershell
npm install @capacitor/android@8.5.2
npx cap add android
```

- The native `@capacitor/android` version must match `@capacitor/core` (8.5.2).
- This creates the `android/` folder: a Gradle project, `MainActivity`, `AndroidManifest.xml`, and the appId as the package name.

### Step 4: Open in Android Studio

```powershell
npx cap open android
```

- The first **Gradle sync** needs internet and can take 5–15 minutes. Wait until the status bar is idle.
- Check **File → Settings → Build, Execution, Deployment → Build Tools → Gradle → Gradle JDK**. It should be the bundled **JBR 21** or JDK 21.

### Step 5: Run on a device

**Real phone (recommended from Milestone 2 on, because emulator GPS is fake):**
1. Settings → About phone → tap **Build number** 7 times to unlock Developer options.
2. Developer options → enable **USB debugging**.
3. Connect USB and accept "Allow USB debugging?" on the phone.
4. `adb devices` should show the phone as `device`. `unauthorized` means the prompt wasn't accepted.

**Emulator:** choose `Pixel_8` in Android Studio's device dropdown.

Run with the green **▶ Run** button in Android Studio, or:

```powershell
npx cap run android
```

### Step 6: Debug the WebView

With the app open on the device, open `chrome://inspect/#devices` in desktop Chrome and click **inspect** under the app. This gives the DevTools console for the app running on the phone. You'll use it in Milestone 2 to see GPS output and errors.

## 4. Everyday workflow

Windows PowerShell 5.1 doesn't support `&&`. Use `;` with `if ($?)`, which means "only if the previous command succeeded":

```powershell
npm run build; if ($?) { npx cap sync android }
```

Then press Run again.

**Live reload** (phone and PC on the same Wi-Fi), introduced in Milestone 2:

```powershell
ionic cap run android -l --external
```

| Command | When to use |
|---|---|
| `npm run build` | Compile `src/` into `www/` |
| `npx cap sync android` | Copy `www/` into `android/` and update native plugins (after build or plugin install) |
| `npx cap copy android` | Copy web files only (faster, no plugin changes) |
| `npx cap open android` | Open the native project in Android Studio |
| `npx cap run android` | Build and install on a device from the terminal |
| `ionic serve` | UI work in the desktop browser (native plugins are limited there) |

## 5. Done when

- [ ] The app icon on the device says **Where Am I?**
- [ ] The blank Ionic starter page opens
- [ ] `chrome://inspect` shows the app and its console opens
- [ ] `git status` shows `android/`, plus changes to `capacitor.config.ts` and `package.json`
- [ ] Committed, for example `git commit -m "Milestone 1: Android platform setup"`
- [ ] Milestone 1 marked ✅ in [../README.md](../README.md)

## 6. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `Could not find the web assets directory: ./www` | Run `npm run build` first |
| `Unsupported class file major version` | Gradle is using the wrong JDK. Set Gradle JDK to JBR 21. |
| `SDK location not found` | `ANDROID_HOME` not visible to Android Studio. Check File → Project Structure → SDK Location. |
| `adb devices` shows `unauthorized` | Accept the USB debugging prompt on the phone. Revoke authorizations and reconnect if needed. |
| `adb devices` shows nothing | Try another cable (some are charge-only), set USB mode to File Transfer, or install the phone's USB driver |
| App shows old content | You forgot `npm run build` + `npx cap sync android` |
| Gradle sync very slow or failing | Needs internet the first time. Retry with File → Sync Project with Gradle Files. |

## 7. Notes / log

Fill this in as you go:

- appId chosen:
- Device used (phone model / emulator):
- Problems hit and how they were solved:
