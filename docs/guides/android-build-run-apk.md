# Guide: Build, Run on the Emulator, and Create an APK

A reference you'll use at every milestone: how code in `src/` becomes an app on the emulator, a phone, or an `.apk` file.

---

## 1. The big picture

```text
 src/  (your TypeScript / HTML / SCSS)
   │   npm run build
   ▼
 www/  (compiled web app)
   │   npx cap sync android
   ▼
 android/  (native Android Studio project)
   │
   ├──► ▶ Run in Android Studio  ──►  emulator or USB phone   (for developing)
   │
   └──► Build APK                ──►  app-debug.apk file       (for installing/sharing)
```

**Rule to remember:** the emulator/phone only sees what's inside `android/`. After changing anything in `src/`, you must **build + sync** again, or you'll be testing old code.

---

## 2. After every code change

Windows PowerShell 5.1 doesn't support `&&`, so use `;` with `if ($?)` ("only if the previous command succeeded"):

```powershell
npm run build; if ($?) { npx cap sync android }
```

Then press **▶ Run** in Android Studio again.

| Command | What it does | When |
|---|---|---|
| `npm run build` | Compiles `src/` into `www/` | Every code change |
| `npx cap sync android` | Copies `www/` into `android/` **and** updates native plugins | After a build, and **always after installing a plugin** |
| `npx cap copy android` | Copies `www/` only (faster) | Code changes when no plugin changed |
| `npx cap open android` | Opens `android/` in Android Studio | When you need Android Studio |
| `npx cap run android` | Builds and installs from the terminal, then asks which device | Alternative to ▶ Run |

---

### Why localhost (browser) and the emulator look different

They're two different devices running the same code:

| Difference | Why | How to make them match |
|---|---|---|
| Dark vs light | By default (**System**) the app follows the device theme, and the PC may be dark while the emulator is light. Each device also remembers its own Light/Dark choice. | Use the same choice on both: the sun/moon button on home, or Settings → Appearance. (Phone theme: Quick Settings → **Dark theme**, or `adb -s emulator-5554 shell cmd uimode night yes`.) |
| Newer vs older code | `ionic serve` reloads instantly. The emulator runs the **installed APK**. | Build + sync + ▶ Run |
| Which page opens | Each device has its own storage (e.g. the "Get Started seen" flag) | Settings → **Show welcome screen** |
| Location values | Browser: PC Wi-Fi/IP estimate (~100 m+). Emulator: fake coordinates you set. | Extended controls → Location |
| Size | Android Studio shows the emulator zoomed out (e.g. 21%) | Zoom the Running Devices panel |
| Native features | Browser uses web fallbacks (no permission dialog, browser voices) | Trust the emulator/phone for native behavior |

**Use localhost for fast layout work. Use the emulator or phone as the truth for permissions, GPS and speech.**

---

## 3. Open the project in Android Studio

```powershell
npx cap open android
```

Or in Android Studio: **File → Open →** select the `android` folder (not the project root).

**First time:**
- Android Studio runs a **Gradle sync**. It downloads build tools, needs internet, and can take 5–15 minutes. Wait until the bottom status bar is idle before pressing Run.
- Check **File → Settings → Build, Execution, Deployment → Build Tools → Gradle → Gradle JDK**. It should be **JBR 21** (bundled) or **JDK 21**.

**Popups you'll see, and what to do:**

| Popup | Action | Why |
|---|---|---|
| "Project update recommended: Android Gradle Plugin … has an upgrade available" | **Dismiss. Don't upgrade.** | Capacitor 8 chooses the AGP version and tests its plugins against it. It changes when Capacitor is upgraded. |
| "Migrate to Gradle Daemon toolchain" | **Ignore** | The current JDK setup already works |
| "Install successfully finished" | Nothing | The app is on the device |

> In a Capacitor project, **let Capacitor manage Android build versions**, not Android Studio's upgrade assistants.

---

## 4. The emulator

### 4.1 Check or create a virtual device

Open **Device Manager** (phone icon on the right sidebar, or **View → Tool Windows → Device Manager**).

This project uses: **`Pixel_8`, Android API 37.2, image "Google APIs PlayStore", GPS enabled.**

To create a new one: **Device Manager → + → Create Virtual Device**
1. Pick a phone (e.g. **Pixel 8**).
2. Pick a system image whose name includes **"Google APIs"** or **"Google Play"**.
   **Important:** the Geolocation plugin uses **Google Play Services** for location. A plain "AOSP" image without Google APIs gives worse location behavior.
3. Finish, then press ▶ next to the device to start it.

### 4.2 Where the emulator appears

Newer Android Studio shows the emulator **inside the IDE** in the **Running Devices** panel.

For a separate window: **File → Settings → Tools → Emulator →** uncheck **"Launch in the Running Devices tool window"**, then restart the emulator.

### 4.3 Run the app on it

1. Select the emulator in the device dropdown at the top (e.g. **Pixel 8**).
2. Make sure the run configuration next to it says **app**.
3. Press the green **▶ Run**.

Terminal alternative:

```powershell
npx cap run android --list                 # show available devices/emulators
npx cap run android --target Pixel_8       # use the name/ID shown by --list
```

### 4.4 Give the emulator a fake GPS location (needed from Milestone 2)

The emulator has no real GPS. You send it coordinates yourself:

1. In the emulator toolbar, click **⋮ (Extended controls)**.
2. Open **Location**.
3. Search for a place or click on the map, then press **Set Location**.
   Or use the **Single points** tab to type exact latitude/longitude.
4. **Routes** tab: plays a path between two points at walking speed. Useful for testing entering and leaving saved locations (Milestone 6).

> The emulator can't simulate poor accuracy, indoor drift, or a slow first fix. **Real accuracy testing needs a real phone.**

### 4.5 If the emulator misbehaves

- Frozen or black screen: **Device Manager → ⋮ → Cold Boot Now**
- App looks stale: build + sync again, then Run
- Very slow: close other heavy programs, and in Windows Features make sure the **Windows Hypervisor Platform** is enabled

---

## 5. Running on a real phone (USB)

1. Phone: **Settings → About phone →** tap **Build number** 7 times (unlocks Developer options).
2. **Developer options → USB debugging:** on.
3. Connect the cable and accept "Allow USB debugging?" on the phone.
4. Check: `adb devices` should list the phone as `device` (not `unauthorized`).
5. Select the phone in Android Studio's device dropdown, then ▶ Run.

---

## 6. Build an APK (to install without Android Studio)

An **APK** is the installable Android app file. There are two kinds:

| | Debug APK | Release APK / AAB |
|---|---|---|
| Signed with | An automatic debug key on your PC | **Your own keystore** |
| Use | Testing, installing on your own phone, showing classmates/teachers | Publishing (Google Play requires an **AAB**) |
| Setup needed | None | Create and protect a keystore |

### 6.1 Debug APK: Android Studio menu

Always build + sync first, so the APK contains your latest code:

```powershell
npm run build; if ($?) { npx cap sync android }
```

Then in Android Studio:
- Newer versions: **Build → Generate App Bundles or APKs → Generate APKs**
- Older versions: **Build → Build Bundle(s) / APK(s) → Build APK(s)**

When it finishes, a popup offers **locate**, which opens the folder.

### 6.2 Debug APK: command line (same result)

```powershell
cd android
.\gradlew.bat assembleDebug
cd ..
```

### 6.3 Where the APK is

```text
android\app\build\outputs\apk\debug\app-debug.apk
```

Verified on this project: the build succeeds and produces an APK of about 4.3 MB. The message `Note: Some input files use unchecked or unsafe operations.` comes from Java code inside the plugins and is harmless.

APK files are **not** committed to git: `*.apk` is already in `.gitignore`, and `android/.gitignore` ignores `build/`.

### 6.4 Install the APK

| Target | How |
|---|---|
| Emulator | Drag `app-debug.apk` onto the emulator screen |
| Emulator or USB phone | `adb install -r android\app\build\outputs\apk\debug\app-debug.apk` (`-r` = replace existing) |
| Any phone, no cable | Copy the file to the phone (Drive, Messenger, USB), tap it, and allow **"Install unknown apps"** for that file manager/app when asked |

If the install fails with "signatures do not match", uninstall the old app first. It was built with a different key, for example on another PC.

### 6.5 Release build (later, not needed yet)

For Google Play or a final version:
1. **Build → Generate Signed App Bundle or APK**, then choose **Android App Bundle** for Play or **APK** for direct install.
2. Create a new **keystore** (`.jks` file) with a strong password.
3. **Protect the keystore:**
   - Back it up somewhere safe. Without it you can't publish updates to the same app.
   - **Never commit it.** Uncomment `*.jks` and `*.keystore` in `android/.gitignore` before creating one.
   - Don't write the passwords in the repo.

---

## 7. Debugging the running app

| Tool | What it shows | How |
|---|---|---|
| **chrome://inspect** | Your app's JavaScript console, errors, network, DOM | Desktop Chrome → `chrome://inspect/#devices` → **inspect** under the app |
| **Logcat** (Android Studio) | Native Android logs: plugin errors, crashes | **View → Tool Windows → Logcat**, then filter by your package `www.gpslocationv2.whereami` |

Use chrome://inspect first. Most problems in this project show up in the JavaScript console.

---

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| App shows old content | `npm run build; if ($?) { npx cap sync android }`, then Run |
| New plugin "not implemented" on Android | You forgot `npx cap sync android` after installing it |
| `Could not find the web assets directory: ./www` | Run `npm run build` first |
| `Unsupported class file major version` | Gradle JDK isn't 21. Fix it in Gradle settings (section 3). |
| `SDK location not found` | File → Project Structure → SDK Location should point to `C:\Users\ron28\AppData\Local\Android\Sdk` |
| Run button greyed out | Gradle sync still running or failed. Try File → Sync Project with Gradle Files. |
| `adb devices` shows `unauthorized` | Accept the prompt on the phone |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` / signatures don't match | Uninstall the old app from the device, then install again |
| `npx cap run android` fails with `'gradlew' is not recognized` | Happens on this PC, probably because of the spaces in the folder path. Use Android Studio's ▶ Run instead, or build with `android\gradlew.bat -p android assembleDebug` and install with `adb install -r android\app\build\outputs\apk\debug\app-debug.apk` |
| Emulator shows a black screen and the app won't open; Logcat is full of `android.hardware.uwb … panicked` or `com.google.android.nfc has died` | The emulator itself became unstable (seen after ~10 hours of uptime). This isn't your app. Restart it: Device Manager → ⋮ → **Cold Boot Now**, or `adb -s emulator-5554 reboot`. Afterwards, set the fake location again. |
| Emulator location never arrives | Set a location in Extended controls → Location, and make sure Location is on in the emulator's quick settings |
