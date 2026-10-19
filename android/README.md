# Finance for Android

A small native app for the Finance project:

- **The Finance web app, full screen**, with its own icon. Pull down to refresh.
- **Bank SMS sent automatically.** When an SMS arrives from one of your bank
  senders (default: `CIB`), the app sends it to your Finance server
  (`POST /api/ingest/sms` with the phone's device key). Every other SMS is ignored
  and never leaves the phone.
- **Nothing is lost.** Messages wait in the app's private storage while the phone is
  away from home Wi-Fi or the computer is off, and are sent when the server is
  reachable again (on every new SMS, when you open the app, and every 15 minutes).
  The server ignores duplicates.
- **Key kept safe.** The device key is encrypted with a key held in the Android
  Keystore and is never logged.

## Install

1. Copy `app-release.apk` to the phone and open it. Allow installing from this source
   when Android asks.
2. Open **Finance**. Phone setup opens the first time:
   1. Address: the one Start Finance prints, e.g. `http://192.168.1.20:3001`. Tap **Test connection**.
   2. Tap **Save and open Finance**, sign in, go to **Settings > Connect a phone**, create a key
      and tap **Use on this phone**.
   3. Back in **Phone setup** (Settings > Phone setup): **Allow SMS access**.
      If Android says the setting is restricted (apps installed outside the Play Store):
      **Open App info > ⋮ > Allow restricted settings**, then tap Allow SMS access again.
   4. Optional: **Import bank SMS from the last 30 days**.

## Build

Needs JDK 21 and the Android SDK (`ANDROID_HOME`, platform 37).

```bash
./gradlew testDebugUnitTest assembleRelease
```

The APK is `app/build/outputs/apk/release/app-release.apk`. It is signed with the
debug key: fine for a personal app installed by hand, not for the Play Store.

## Code

| File | What it does |
|---|---|
| `SmsReceiver.kt` | Gets each incoming SMS, joins multi-part messages, keeps bank senders only |
| `SmsQueue.kt` | Saved queue + `FlushWorker` that sends and decides retry / skip / stop |
| `SmsRules.kt` | Pure rules (sender match, time with offset, URL cleanup, JSON), unit tested |
| `SecretStore.kt` | AES-GCM with an Android Keystore key, for the device key |
| `MainActivity.kt` | Full-screen WebView, file picker for statement PDFs, `window.FinanceAndroid` bridge |
| `SetupActivity.kt` | Address, key, senders, SMS permission, queue status |
