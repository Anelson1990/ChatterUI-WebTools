const IS_DEV = process.env.APP_VARIANT === 'development'
const IS_PREVIEW = process.env.EAS_BUILD_PROFILE === 'preview'

module.exports = {
    expo: {
        name: IS_DEV
            ? 'ChatterUI (DEV)'
            : IS_PREVIEW
                ? 'ChatterUI Test'
                : 'ChatterUI',

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
            package: IS_DEV ? 'com.Vali98.ChatterUIDev' : 'com.Vali98.ChatterUI',
            bundleIdentifier: IS_DEV ? 'com.Vali98.ChatterUIDev' : 'com.Vali98.ChatterUI',
        },

        android: {
            adaptiveIcon: {
                foregroundImage: './assets/images/adaptive-icon-foreground.png',
                backgroundImage: './assets/images//adaptive-icon-background.png',
                monochromeImage: './assets/images/adaptive-icon-foreground.png',
                backgroundColor: '#000',
            },

            package: IS_DEV
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
                        enableProguardInReleaseBuilds: true,
                        enableShrinkResourcesInReleaseBuilds: true,
                        useLegacyPackaging: true,

                        // Build only ARM64 for the preview APK.
                        buildArchs:
                            process.env.EAS_BUILD_PROFILE === 'preview'
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

            ['@vali98/react-native-process-text', { label: 'Ask In ChatterUi' }],

            [
                'expo-camera',
                {
                    cameraPermission:
                        'Allow ChatterUI to access your camera',
                },
            ],

            ['expo-sqlite', { withSQLiteVecExtension: true }],

            [
                'expo-image-picker',
                {
                    photosPermission:
                        'ChatterUI requires image permissions for vision models',
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
