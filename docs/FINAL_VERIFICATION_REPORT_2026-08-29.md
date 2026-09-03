# SEALS Final Engineering Verification

**Date:** 2026-08-29  
**Scope:** Flutter client, Next.js API/admin, standalone admin panel, MongoDB
integration and concurrency behavior, Android release signing, CI, and release
documentation.

## Executive result

The requested engineering checklist is complete at source-code and local build
level. Android produced a newly signed release-mode APK. Backend unit,
integration, concurrency, audit, typecheck, and production build gates pass.
Flutter format, analysis, 32 tests, Android release, and Web release gates pass.
The standalone admin panel typechecks and builds.

iOS project settings are verified, but an IPA cannot be signed or archived on
this Windows workstation; that final distribution action requires the owning
Apple Developer team, macOS, and Xcode.

## Requested checklist

| Item | Result | Evidence |
| --- | --- | --- |
| Android/iOS release configuration and signed APK | **Complete with iOS external prerequisite** | Android signed APK built and verified; iOS bundle/signing settings reviewed; release guide added |
| MongoDB live integration tests | **Complete** | 7 tests on a real disposable replica set; optional guarded external replica-set mode |
| Purchase chaos/concurrency test | **Complete** | Configurable rounds/concurrency; oversell, duplicate cancel, and duplicate receipt invariants |
| RTL/LTR polish and design-system review | **Complete for the requested pass** | Directional tokens/helpers, mirrored overlays, LTR machine values, 48px controls, 5 contract tests |
| Backend lint and full suite re-verification | **Complete** | TypeScript, 57 unit tests, integration typecheck, 7 integration tests, audit, Next build |
| Final report/documentation | **Complete** | This report, updated testing/deployment docs, and mobile release guide |

## Android release artifact

The APK was built after the final UI and signing changes with:

```powershell
flutter build apk --release --dart-define=ALLOW_LOCAL_PRODUCT_MODE=true
```

| Property | Value |
| --- | --- |
| Artifact | `app/build/app/outputs/flutter-apk/app-release.apk` |
| Size | 62,085,028 bytes (59.2 MB) |
| SHA-256 | `F8CDD26BDEB1C85A54086445961C2DCED0E6A6EA6168D02CFC6A00A37805D875` |
| Package | `com.seals.b2b` |
| Version | `1.0.0` (`versionCode=1`) |
| SDK | min 24, target 36, compile 37 |
| Signature | APK Signature Scheme v2 verified; RSA-4096 signer |
| Certificate SHA-256 | `4534B8C17D464B15D0677298C575141C5D7EC4A9796B8B8A2C105657ABA66090` |

The local upload keystore and `android/key.properties` are ignored by Git. They
must be transferred to an approved password manager/backup and formally owned
by the Play Console owner before public distribution.

This specific APK is an **internal QA artifact** because local product mode was
enabled to permit testing without a final production API domain. The store
artifact must be rebuilt without that flag after setting the real HTTPS
`API_BASE_URL_PROD`, incrementing version/build numbers, and completing the
release smoke checklist in
[`app/docs/RELEASE_BUILD.md`](../app/docs/RELEASE_BUILD.md).

## iOS verification

- bundle identifier: `com.seals.b2b`;
- minimum iOS version: 13.0;
- signing style: Automatic;
- camera and photo-library privacy descriptions: present;
- no personal `DEVELOPMENT_TEAM`, certificate, or provisioning profile is
  committed.

Required external completion: select the organization team in Xcode on macOS,
register the identifier, verify capabilities/profiles, and run
`flutter build ipa --release` or an Xcode archive.

## MongoDB integration and purchase chaos

The suite uses `MongoMemoryReplSet`, so transactions, indexes, conditional
updates, and rollback behavior execute against an actual MongoDB replica-set
process. It covers:

1. concurrent idempotent order creation;
2. inventory reservation and exact goods/platform obligations;
3. payment confirmation and transition to `preparing`;
4. exactly-once inventory commit under duplicate receipt confirmation;
5. multi-item reservation rollback;
6. rollback when beneficiary payment destinations are absent;
7. stale orphan recovery, final-stock contention, and configurable chaos.

The external mode is destructive by design but fails closed unless the database
name is unmistakably test-only and the operator supplies the explicit
confirmation phrase. See [Testing](TESTING.md).

The suite exposed and verified fixes for:

- an orphan-reconciliation query that could fail to release reserved stock;
- optional SKU uniqueness: the old compound sparse index allowed `null` to
  collide within an organization;
- repeated platform-settings fixtures during multi-round chaos tests.

Existing deployments must run the idempotent
`npm run migrate:product-sku-index` migration before starting the upgraded API.

## RTL/LTR and design-system result

- centralized directional spacing with `EdgeInsetsDirectional` and
  `AlignmentDirectional`;
- machine-readable values (email, phone, numeric IDs, URLs, passwords) remain
  LTR inside Arabic pages;
- Arabic headings no longer inherit Latin letter spacing;
- filled/elevated/outlined/icon buttons and list tiles enforce the 48px minimum
  interaction target;
- bottom sheets, tabs, navigation, chips, and shared control radii/colors are
  centralized in the theme;
- profile cover/avatar controls, video mute control, gradients, and selected
  high-impact layouts mirror correctly.

Translation coverage of older secondary screens remains separate product debt;
this pass establishes the design-system and directionality contract for new and
updated UI.

## Verification record

| Area | Command | Result |
| --- | --- | --- |
| Backend typecheck | `npm run lint` | Pass |
| Backend unit tests | `npm test` | 57/57 pass |
| Integration typecheck | `npm run typecheck:integration` | Pass |
| MongoDB/chaos | `npm run test:integration` | 7/7 pass |
| Dependency audit | `npm audit --audit-level=high` | 0 vulnerabilities |
| Backend production build | `npm run build` | Pass |
| Flutter format | `dart format --output=none --set-exit-if-changed .` | Pass after repository-wide normalization |
| Flutter analysis | `flutter analyze` | No issues |
| Flutter tests | `flutter test` | 32/32 pass |
| Flutter Android release | `flutter build apk --release ...` | Pass, signed APK verified |
| Flutter Web release | `flutter build web --release` | Pass; Wasm dry run pass |
| Standalone admin typecheck | `npm run lint` | Pass |
| Standalone admin production build | `npm run build` | Pass |

## CI and remaining external gates

CI now includes the integration-suite typecheck, cached MongoDB binary, the
full MongoDB/chaos run before the production backend build, and independent
typecheck/security/build gates for the standalone admin panel.

The following are not code failures and still require owner/environment action:

- replace QA API configuration with the real production HTTPS domain and
  rebuild store artifacts;
- preserve/transfer the Android signing key and register the package in Play
  Console;
- create and sign the iOS archive on the owning Apple/macOS environment;
- run full authenticated staging E2E with real SMTP, Cloudinary, payment proof,
  and pilot organizations;
- obtain legal, accounting, and operational launch approval.
