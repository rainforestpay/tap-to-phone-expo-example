import "dotenv/config";
import { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
    name: "Capyshop",
    slug: "capyshop-expo-react-native",
    scheme: "capyshop",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    splash: {
        image: "./assets/splash-icon.png",
        resizeMode: "contain",
        backgroundColor: "#A4D65E",
    },
    ios: {
        supportsTablet: false,
        bundleIdentifier: "com.example.yourapp", // TODO: replace with your onboarded bundle identifier
        infoPlist: {
            PRODUCT_TEAM_IDENTIFIER: "YOUR_TEAM_ID", // TODO: replace with your Apple Developer Team ID
            ITSAppUsesNonExemptEncryption: false,
            NSLocationWhenInUseUsageDescription:
                "Location needed for Tap to Phone payments",
            NSLocationAlwaysUsageDescription:
                "Location needed for Tap to Phone payments",
            UIRequiredDeviceCapabilities: [
                "iphone-ipad-minimum-performance-a12",
            ],
        },
        entitlements: {
            "com.apple.developer.nfc.readersession.formats": ["TAG"],
            "com.apple.developer.proximity-reader.payment.acceptance": true,
        },
    },
    android: {
        package: "com.example.yourapp", // TODO: replace with your onboarded Android app ID
        adaptiveIcon: {
            foregroundImage: "./assets/adaptive-icon.png",
            backgroundColor: "#ffffff",
        },
        edgeToEdgeEnabled: true,
        predictiveBackGestureEnabled: false,
    },
    web: {
        favicon: "./assets/favicon.png",
    },
    extra: {
        sessionKey: process.env.RAINFOREST_SESSION_KEY || "",
        deviceRegistrationId:
            process.env.RAINFOREST_DEVICE_REGISTRATION_ID || "",
        merchantId: process.env.RAINFOREST_MERCHANT_ID || "",
        environment: process.env.RAINFOREST_ENVIRONMENT || "sandbox",
    },
    plugins: [
        [
            "./plugins/withAndroidTapToPhone",
            {
            },
        ],
        "./plugins/withAndroidSigning",
        [
            "expo-build-properties",
            {
                ios: {
                    deploymentTarget: "17.4",
                },
                android: {
                    minSdkVersion: 31,
                },
            },
        ],
    ],
};

export default config;
