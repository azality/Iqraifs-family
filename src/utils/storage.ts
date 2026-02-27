/**
 * Cross-platform storage utility using Capacitor Preferences
 * Works on web (fallback to localStorage) and native iOS/Android
 */
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

const isNative = Capacitor.isNativePlatform();

// Storage keys used in the app
export const STORAGE_KEYS = {
  USER_ID: 'fgs_user_id',
  USER_NAME: 'fgs_user_name',
  USER_EMAIL: 'user_email',
  USER_ROLE: 'user_role',
  USER_MODE: 'fgs_user_mode',
  FAMILY_ID: 'fgs_family_id',
  ACCESS_TOKEN: 'fgs_access_token',
  KID_SESSION_TOKEN: 'kid_session_token',
  CHILD_ID: 'child_id',
} as const;

/**
 * Set a value in storage (async)
 */
export async function setStorage(key: string, value: string): Promise<void> {
  if (isNative) {
    await Preferences.set({ key, value });
    console.log(`📱 [Native Storage] Set: ${key}`, value.substring(0, 20) + '...');
  } else {
    localStorage.setItem(key, value);
    console.log(`🌐 [Web Storage] Set: ${key}`, value.substring(0, 20) + '...');
  }
}

/**
 * Get a value from storage (async)
 */
export async function getStorage(key: string): Promise<string | null> {
  if (isNative) {
    const { value } = await Preferences.get({ key });
    console.log(`📱 [Native Storage] Get: ${key}`, value ? value.substring(0, 20) + '...' : 'null');
    return value;
  } else {
    const value = localStorage.getItem(key);
    console.log(`🌐 [Web Storage] Get: ${key}`, value ? value.substring(0, 20) + '...' : 'null');
    return value;
  }
}

/**
 * Remove a value from storage (async)
 */
export async function removeStorage(key: string): Promise<void> {
  if (isNative) {
    await Preferences.remove({ key });
    console.log(`📱 [Native Storage] Remove: ${key}`);
  } else {
    localStorage.removeItem(key);
    console.log(`🌐 [Web Storage] Remove: ${key}`);
  }
}

/**
 * Clear all storage (async)
 */
export async function clearStorage(): Promise<void> {
  if (isNative) {
    await Preferences.clear();
    console.log(`📱 [Native Storage] Cleared all`);
  } else {
    localStorage.clear();
    console.log(`🌐 [Web Storage] Cleared all`);
  }
}

/**
 * Get multiple values at once (optimized for native)
 */
export async function getMultiple(keys: string[]): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {};
  
  if (isNative) {
    // Get all keys in parallel on native
    const promises = keys.map(key => Preferences.get({ key }));
    const values = await Promise.all(promises);
    keys.forEach((key, index) => {
      result[key] = values[index].value;
    });
  } else {
    // Synchronous on web
    keys.forEach(key => {
      result[key] = localStorage.getItem(key);
    });
  }
  
  return result;
}

/**
 * Set multiple values at once (optimized for native)
 */
export async function setMultiple(items: Record<string, string>): Promise<void> {
  if (isNative) {
    // Set all keys in parallel on native
    const promises = Object.entries(items).map(([key, value]) => 
      Preferences.set({ key, value })
    );
    await Promise.all(promises);
    console.log(`📱 [Native Storage] Set multiple:`, Object.keys(items));
  } else {
    // Synchronous on web
    Object.entries(items).forEach(([key, value]) => {
      localStorage.setItem(key, value);
    });
    console.log(`🌐 [Web Storage] Set multiple:`, Object.keys(items));
  }
}

/**
 * Remove multiple values at once (optimized for native)
 */
export async function removeMultiple(keys: string[]): Promise<void> {
  if (isNative) {
    // Remove all keys in parallel on native
    const promises = keys.map(key => Preferences.remove({ key }));
    await Promise.all(promises);
    console.log(`📱 [Native Storage] Removed multiple:`, keys);
  } else {
    // Synchronous on web
    keys.forEach(key => localStorage.removeItem(key));
    console.log(`🌐 [Web Storage] Removed multiple:`, keys);
  }
}