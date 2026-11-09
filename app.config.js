const IS_DEV = process.env.APP_VARIANT === 'development'
const IS_PREVIEW = process.env.EAS_BUILD_PROFILE === 'preview'
const IS_ROOM = process.env.EXPO_PUBLIC_ROOM_BUILD === '1'

module.exports = {
    expo: {
        name: IS_ROOM
            ? 'Nexus — The Room'
            : IS_DEV
                ? 'NEXUS (DEV)'
                : 'NEXUS',

        newArchEnabled: true,
        slug: 'ChatterUI',
        version: '0.10.1',
        orientation: 'default',
        icon: './assets/images/icon.png',
        scheme: 'chatterui',
        userInterfaceStyle: 'automatic',
        assetBundlePatterns: ['**/*'],

        ios: {
            icon: {
                dark: './assets/images/ios-dark.png',
                light: './assets/images/ios-light.png',
                tinted: './assets/images/icon.png',
            },
            supportsTablet: true,
            package: IS_DEV
                ? 'com.Vali98.ChatterUIDev'
                : 'com.Vali98.ChatterUI',
            bundleIdentifier: IS_DEV
                ? 'com.Vali98.ChatterUIDev'
                : 'com.Vali98.ChatterUI',
        },

        android: {
            adaptiveIcon: {
                foregroundImage:
                    './assets/images/adaptive-icon-foreground.png',
                backgroundImage:
                    './assets/images//adaptive-icon-background.png',
                monochromeImage:
                    './assets/images/adaptive-icon-foreground.png',
                backgroundColor: '#000',
            },

            package: IS_ROOM
                ? 'com.nelco.nexusroom'
                : IS_DEV
                    ? 'com.Vali98.ChatterUIDev'
                    : IS_PREVIEW
                        ? 'com.Vali98.ChatterUITest'
                        : 'com.Vali98.ChatterUI',

            userInterfaceStyle: 'dark',

            permissions: [
                'android.permission.FOREGROUND_SERVICE',
                'android.permission.WAKE_LOCK',
                'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
            ],
        },

        web: {
            bundler: 'metro',
            output: 'static',
            favicon: './assets/images/adaptive-icon.png',
        },

        plugins: [
            [
                'expo-asset',
                {
                    assets: [
                        './assets/models/aibot.raw',
                        './assets/models/actress.raw',
                        './assets/models/llama3tokenizer.gguf',
                    ],
                },
            ],

            [
                'expo-build-properties',
                {
                    android: {
                        largeHeap: true,
                        usesCleartextTraffic: true,
                        // Room builds skip ProGuard/R8 and resource
                        // shrinking: the EAS free-plan 45-minute build
                        // limit killed two Room builds in/near those
                        // phases (2026-11-09). Room-only — preview and
                        // production keep the upstream settings.
                        enableProguardInReleaseBuilds: !IS_ROOM,
                        enableShrinkResourcesInReleaseBuilds: !IS_ROOM,
                        useLegacyPackaging: true,

                        // Build only ARM64 for the preview APK.
                        // Room builds too: EAS_BUILD_PROFILE for the
                        // room profile reports 'preview' as its
                        // environment, and Expo's logs showed the room
                        // fingerprint building all four ABIs.
                        buildArchs:
                            process.env.EAS_BUILD_PROFILE ===
                                'preview' || IS_ROOM
                                ? ['arm64-v8a']
                                : undefined,

                        extraProguardRules:
                            '-keep class com.rnllama.** { *; }',
                    },
                },
            ],

            [
                'expo-splash-screen',
                {
                    backgroundColor: '#000000',
                    image: './assets/images/adaptive-icon.png',
                    imageWidth: 200,
                },
            ],

            [
                'expo-notifications',
                {
                    icon: './assets/images/notification.png',
                },
            ],

            [
                './expo-build-plugins/androidattributes.plugin.js',
                {
                    'android:largeHeap': true,
                },
            ],

            [
                '@vali98/react-native-process-text',
                {
                    label: 'Ask In NEXUS',
                },
            ],

            [
                'expo-camera',
                {
                    cameraPermission:
                        'Allow NEXUS to access your camera',
                },
            ],

            ['expo-sqlite', { withSQLiteVecExtension: true }],

            [
                'expo-image-picker',
                {
                    photosPermission:
                        'NEXUS requires image permissions for vision models',
                    colors: {
                        cropToolbarColor: '#000000',
                    },
                    dark: {
                        colors: {
                            cropToolbarColor: '#000000',
                        },
                    },
                },
            ],

            'expo-localization',
            'expo-router',
            'expo-font',
            'expo-image',

            './expo-build-plugins/bgactions.plugin.js',
            './expo-build-plugins/usercert.plugin.js',
            './expo-build-plugins/rnllama.plugin.js',
            './expo-build-plugins/copyhtp.plugin.js',

            '@react-native-vector-icons/ant-design',
            '@react-native-vector-icons/octicons',
            '@react-native-vector-icons/material-icons',
        ],

        experiments: {
            typedRoutes: true,
            reactCompiler: true,
        },

        extra: {
            roomBuild: IS_ROOM,

            router: {
                origin: false,
            },

            eas: {
                projectId:
                    'ecc89c53-6265-4394-9aac-d34a1dc80fbc',
            },
        },
    },
}
