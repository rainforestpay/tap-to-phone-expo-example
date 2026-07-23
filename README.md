# Capyshop - Expo / React Native Example

This app uses a local Expo module in `modules/rainforestpay-tap-sdk` to bridge the Rainforest Android and iOS SDKs. It needs a development build or prebuilt native project; it will not run inside Expo Go because the Tap to Phone SDK is native code.

## SDK versions
| Platform | Version | Notes |
| --- | --- | --- |
| iOS | 0.6.2 (`RainforestSDK.xcframework`) | iOS 17.4+ |
| Android | 0.2.3 (`android-sdk-sandbox-debug`) | `minSdk` 31 (Android 12+), Kotlin 2.2 |

The app uses the SDKs' **auto mode** (`RainforestPay.TapToPhoneAuto` on iOS, `RainforestPay.tapToPhoneAuto` on Android). `initialize` runs the one-time setup (permissions and merchant terms) and starts auto mode. The SDK then prepares and resumes on its own, so there is no `prepare()` call in the app. Background prepare failures arrive as `prepareFailed` events and are retried by the SDK. An `invalidSessionKey` event means the session key expired and must be replaced.

In Production, the Android SDK refuses to run while Developer options, USB debugging or wireless debugging is on, and it requires NFC to be on in every environment.

## App identifiers
Set these in `app.config.ts` before you prebuild. They ship as placeholders, and the app will not work for Tap to Phone until you replace them.

| Setting | Location in `app.config.ts` | Placeholder | Use |
| --- | --- | --- | --- |
| iOS bundle identifier | `ios.bundleIdentifier` | `com.example.yourapp` | The bundle ID you onboarded with Rainforest for Tap to Phone |
| Apple Team ID | `ios.infoPlist.PRODUCT_TEAM_IDENTIFIER` | `YOUR_TEAM_ID` | Your 10-character Apple Developer Team ID (Apple Developer account > Membership details) |
| Android app ID | `android.package` | `com.example.yourapp` | The app ID you onboarded with Rainforest for Tap to Phone |

If you change these after a prebuild, run `npx expo prebuild --clean` so the native projects pick up the new values.

## Android configuration
* Use the Android SDK Keystore that you onboarded with Rainforest for Tap to Phone. You will reference that keystore in the `.env` file

## Environment Variables
1. copy example file to `.env` file
    ```
    cp .env.example .env
    ```
2. set environment
    ```
    EXPO_PUBLIC_SESSION_KEY=sbx_session_****
    EXPO_PUBLIC_DEVICE_REGISTRATION_ID=sbx_dvc_****
    EXPO_PUBLIC_MERCHANT_ID=sbx_mid_***
    EXPO_PUBLIC_ENVIRONMENT=sandbox

    # ANDROID CONFIG
    DEBUG_SIGNING_KEY_PATH=signing_keys/rfsdkdemo.jks # path to where the keystore jks is
    DEBUG_SIGNING_KEY_ALIAS=rfsdkdemo # use your key alias
    DEBUG_SIGNING_KEY_PASSWORD=**** # use your key password
    DEBUG_SIGNING_STORE_PASSWORD=**** # use your keystore password
    ```

## Run
1. Prebuild
    ```sh
    npm install
    npx expo prebuild --platform [android|ios]
    ```
2. Start metro dev server
    ```
    yarn start -d
    ```
3. Run in Android Studio or XCode