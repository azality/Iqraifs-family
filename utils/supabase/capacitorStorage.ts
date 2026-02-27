/**
 * Capacitor Preferences storage adapter for Supabase auth on iOS/Android.
 * 
 * Benefits over localStorage:
 * - Native storage backing (more reliable on iOS)
 * - Survives app updates and low-storage conditions
 * - Works consistently across WebView contexts
 * - Better performance on mobile devices
 * 
 * This module dynamically imports Capacitor packages to avoid build-time dependencies.
 */

// Check if we're in a native platform at runtime
const isNativePlatform = (): boolean => {
  try {
    // Check for Capacitor global
    return !!(window as any).Capacitor && (window as any).Capacitor.isNativePlatform?.();
  } catch {
    return false;
  }
};

// Lazy-load Capacitor Preferences
let PreferencesModule: any = null;
const getPreferences = async () => {
  if (!PreferencesModule && isNativePlatform()) {
    try {
      const module = await import('@capacitor/preferences');
      PreferencesModule = module.Preferences;
    } catch (error) {
      console.warn('[CapacitorStorage] Failed to load Preferences, falling back to localStorage:', error);
    }
  }
  return PreferencesModule;
};

export const capacitorStorage = {
  async getItem(key: string): Promise<string | null> {
    // Use native storage on mobile platforms
    const prefs = await getPreferences();
    if (prefs) {
      try {
        const { value } = await prefs.get({ key });
        return value ?? null;
      } catch (error) {
        console.error(`[CapacitorStorage] Error getting item ${key}:`, error);
      }
    }

    // Fallback to localStorage
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      console.error(`[CapacitorStorage] localStorage error for ${key}:`, error);
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    // Use native storage on mobile platforms
    const prefs = await getPreferences();
    if (prefs) {
      try {
        await prefs.set({ key, value });
        return;
      } catch (error) {
        console.error(`[CapacitorStorage] Error setting item ${key}:`, error);
      }
    }

    // Fallback to localStorage
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      console.error(`[CapacitorStorage] localStorage error for ${key}:`, error);
    }
  },

  async removeItem(key: string): Promise<void> {
    // Use native storage on mobile platforms
    const prefs = await getPreferences();
    if (prefs) {
      try {
        await prefs.remove({ key });
        return;
      } catch (error) {
        console.error(`[CapacitorStorage] Error removing item ${key}:`, error);
      }
    }

    // Fallback to localStorage
    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      console.error(`[CapacitorStorage] localStorage error for ${key}:`, error);
    }
  },
};
