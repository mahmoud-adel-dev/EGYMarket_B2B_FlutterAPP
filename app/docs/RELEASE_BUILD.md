# Mobile release builds

This guide covers the signing and release prerequisites for the Flutter client.
Never commit a keystore, signing password, Apple certificate, provisioning
profile, or a populated `.env` file.

## Release prerequisites

- Increment `version` in `pubspec.yaml` for every store release.
- Set `API_BASE_URL_PROD` in the ignored `app/.env` file to the public HTTPS API
  URL. A release build intentionally refuses to use `localhost` at runtime.
- Run `flutter analyze` and `flutter test` before producing store artifacts.
- Preserve signing identities. Updating an installed application requires the
  same Android signing lineage and the same Apple bundle identifier/team.

## Android

### Create the upload key once

Use a JDK `keytool` and keep the resulting file and passwords in a secure,
redundant backup:

```powershell
keytool -genkeypair -v `
  -keystore android/seals-release.jks `
  -storetype JKS `
  -keyalg RSA -keysize 4096 -validity 10000 `
  -alias seals-release
Copy-Item android/key.properties.example android/key.properties
```

Replace every `replace-me` value in `android/key.properties`. The example
`storeFile=../seals-release.jks` is resolved from `android/app` and points to
`android/seals-release.jks`.

The Gradle configuration fails release builds when any signing value or the
keystore is missing. Local builds read `android/key.properties`. CI can avoid a
properties file by injecting these protected environment variables:

- `SEALS_ANDROID_STORE_FILE`
- `SEALS_ANDROID_STORE_PASSWORD`
- `SEALS_ANDROID_KEY_ALIAS`
- `SEALS_ANDROID_KEY_PASSWORD`

Build and inspect the artifacts:

```powershell
flutter clean
flutter pub get
flutter build apk --release
flutter build appbundle --release
```

- APK: `build/app/outputs/flutter-apk/app-release.apk`
- Play Store bundle: `build/app/outputs/bundle/release/app-release.aab`

The locally generated key is suitable as a Play upload key only if ownership
and backup have been formally transferred to the Play Console owner. Do not
publish an artifact signed by a disposable or unknown key.

## iOS

iOS archives require macOS, Xcode, an Apple Developer team, and access to the
team's signing identity. The project currently uses automatic signing with:

- bundle identifier: `com.seals.b2b`
- minimum iOS version: `13.0`
- version/build number: inherited from `pubspec.yaml`

On the release Mac:

1. Open `ios/Runner.xcworkspace` in Xcode.
2. Select **Runner > Signing & Capabilities**.
3. Choose the owning Apple Developer team and confirm that the bundle
   identifier is registered to that team.
4. Confirm camera and photo-library privacy descriptions.
5. Build with `flutter build ipa --release`, or archive through Xcode.

Do not hard-code a personal `DEVELOPMENT_TEAM` in the repository. Supply team
and export settings through the release environment or the organization's CI.

## Release checklist

- [ ] Production API health endpoint is reachable over HTTPS.
- [ ] Android upload key and Apple signing assets have named owners and backups.
- [ ] Package/bundle identifiers are registered to the organization.
- [ ] Version and build numbers are unique.
- [ ] Release smoke test covers authentication, media upload, cart, checkout,
      payment-proof submission, order chat, notifications, and logout.
- [ ] APK/AAB/IPA checksums and build logs are retained with the release record.
