import { CapacitorConfig } from '@capacitor/core';

const config: CapacitorConfig = {
  appId: 'com.fgs.kids',
  appName: 'FGS Kids',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    hostname: 'localhost',
    iosScheme: 'https',
    androidScheme: 'https'
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#F59E0B', // Warm orange for kids mode
      showSpinner: true,
      spinnerColor: '#ffffff',
      androidSpinnerStyle: 'large',
      iosSpinnerStyle: 'large',
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'light',
      backgroundColor: '#F59E0B'
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    }
  }
};

export default config;