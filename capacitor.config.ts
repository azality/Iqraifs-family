import { CapacitorConfig } from '@capacitor/core';

// Read from environment variable: "parent" | "kids"
const mode = process.env.CAP_APP_MODE || 'parent';

const config: CapacitorConfig = mode === 'kids'
  ? {
      // ===== KIDS MODE =====
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
    }
  : {
      // ===== PARENT MODE =====
      appId: 'com.fgs.parent',
      appName: 'FGS Parent',
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
          backgroundColor: '#8B5CF6', // Purple for parent mode
          showSpinner: true,
          spinnerColor: '#ffffff',
          androidSpinnerStyle: 'large',
          iosSpinnerStyle: 'large',
          splashFullScreen: true,
          splashImmersive: true,
        },
        StatusBar: {
          style: 'dark',
          backgroundColor: '#8B5CF6'
        },
        PushNotifications: {
          presentationOptions: ['badge', 'sound', 'alert']
        }
      }
    };

export default config;
