import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Batman',
  slug: 'batman-app',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'batman-app',
  userInterfaceStyle: 'dark',
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#080808',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.tlenoir.batmanapp',
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#080808',
    },
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-dev-client',
    [
      'expo-audio',
      {
        microphonePermission:
          'Batman uses the microphone for secure realtime voice.',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
};

export default config;
