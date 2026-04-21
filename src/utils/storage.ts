/**
 * Cross-platform storage utility using Capacitor Preferences
 * Works on web (fallback to localStorage) and native iOS/Android
 *
 * Two flavors of every operation:
 *   - async (getStorage / setStorage / ...)  — uses Capacitor Preferences on native, localStorage on web
 *   - sync  (getStorageSync / setStorageSync / ...) — always uses localStorage, safe inside React render
 *     paths (component bodies, useState initializers, sync event handlers)
 *
 * Use the sync variants from inside React render code. Use the async variants from inside
 * useEffect, async event handlers, or other async contexts where you need real Capacitor
 * persistence on native.
 */
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

const isNative = Capacitor.isNativePlatform();
const isDev =
  import.meta.env.DEV ||
  (typeof window !== 'undefined' && window.location && window.location.hostname === 'localhost');

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

// ---------------------------------------------------------------------------
// Async variants (preferred on native / inside async contexts)
// ---------------------------------------------------------------------------

/** Set a value in storage (async) */
export async function setStorage(key: string, value: string): Promise<void> {
  if (isNative) {
    await Preferences.set({ key, value });
    if (isDev) console.log(`[Native Storage] Set: ${key}`, value.substring(0, 20) + '...');
  } else {
    localStorage.setItem(key, value);
    if (isDev) console.log(`[Web Storage] Set: ${key}`, value.substring(0, 20) + '...');
  }
}

/** Get a value from storage (async) */
export async function getStorage(key: string): Promise<string | null> {
  if (isNative) {
    const { value } = await Preferences.get({ key });
    if (isDev) console.log(`[Native Storage] Get: ${key}`, value ? value.substring(0, 20) + '...' : 'null');
    return value;
  } else {
    const value = localStorage.getItem(key);
    if (isDev) console.log(`[Web Storage] Get: ${key}`, value ? value.substring(0, 20) + '...' : 'null');
    return value;
  }
}

/** Remove a value from storage (async) */
export async function removeStorage(key: string): Promise<void> {
  if (isNative) {
    await Preferences.remove({ key });
    if (isDev) console.log(`[Native Storage] Remove: ${key}`);
  } else {
    localStorage.removeItem(key);
    if (isDev) console.log(`[Web Storage] Remove: ${key}`);
  }
}

/** Clear all storage (async) */
export async function clearStorage(): Promise<void> {
  if (isNative) {
    await Preferences.clear();
    if (isDev) console.log(`[Native Storage] Cleared all`);
  } else {
    localStorage.clear();
    if (isDev) console.log(`[Web Storage] Cleared all`);
  }
}

/** Get multiple values at once (async, optimized for native) */
export async function getMultiple(keys: string[]): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {};
  if (isNative) {
    const promises = keys.map((key) => Preferences.get({ key }));
    const values = await Promise.all(promises);
    keys.forEach((key, index) => {
      result[key] = values[index].value;
    });
  } else {
    keys.forEach((key) => {
      result[key] = localStorage.getItem(key);
    });
  }
  return result;
}

/** Set multiple values at once (async, optimized for native) */
export async function setMultiple(items: Record<string, string>): Promise<void> {
  if (isNative) {
    const promises = Object.entries(items).map(([key, value]) =>
      Preferences.set({ key, value })
    );
    await Promise.all(promises);
    if (isDev) console.log(`[Native Storage] Set multiple:`, Object.keys(items));
  } else {
    Object.entries(items).forEach(([key, value]) => {
      localStorage.setItem(key, value);
    });
    if (isDev) console.log(`[Web Storage] Set multiple:`, Object.keys(items));
  }
}

/** Remove multiple values at once (async, optimized for native) */
export async function removeMultiple(keys: string[]): Promise<void> {
  if (isNative) {
    const promises = keys.map((key) => Preferences.remove({ key }));
    await Promise.all(promises);
    if (isDev) console.log(`[Native Storage] Removed multiple:`, keys);
  } else {
    keys.forEach((key) => localStorage.removeItem(key));
    if (isDev) console.log(`[Web Storage] Removed multiple:`, keys);
  }
}

// ---------------------------------------------------------------------------
// Sync variants — safe inside React render / useState initializers / sync handlers
// On web (Netlify) these are equivalent to the async ones.
// On native iOS/Android, they read/write to the embedded WebView's localStorage.
// (For native persistence guarantees, use the async variants from inside useEffect.)
// ---------------------------------------------------------------------------

function hasLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

/** Set a value in storage (sync, web/localStorage only) */
export function setStorageSync(key: string, value: string): void {
  if (!hasLocalStorage()) return;
  localStorage.setItem(key, value);
  if (isDev) console.log(`[Sync Storage] Set: ${key}`, value.substring(0, 20) + '...');
}

/** Get a value from storage (sync, web/localStorage only) */
export function getStorageSync(key: string): string | null {
  if (!hasLocalStorage()) return null;
  const value = localStorage.getItem(key);
  if (isDev) console.log(`[Sync Storage] Get: ${key}`, value ? value.substring(0, 20) + '...' : 'null');
  return value;
}

/** Remove a value from storage (sync, web/localStorage only) */
export function removeStorageSync(key: string): void {
  if (!hasLocalStorage()) return;
  localStorage.removeItem(key);
  if (isDev) console.log(`[Sync Storage] Remove: ${key}`);
}

/** Clear all storage (sync, web/localStorage only) */
export function clearStorageSync(): void {
  if (!hasLocalStorage()) return;
  localStorage.clear();
  if (isDev) console.log(`[Sync Storage] Cleared all`);
}

/** Get multiple values at once (sync) */
export function getMultipleSync(keys: string[]): Record<string, string | null> {
  const result: Record<string, string | null> = {};
  if (!hasLocalStorage()) {
    keys.forEach((key) => (result[key] = null));
    return result;
  }
  keys.forEach((key) => {
    result[key] = localStorage.getItem(key);
  });
  return result;
}

/** Set multiple values at once (sync) */
export function setMultipleSync(items: Record<string, string>): void {
  if (!hasLocalStorage()) return;
  Object.entries(items).forEach(([key, value]) => {
    localStorage.setItem(key, value);
  });
  if (isDev) console.log(`[Sync Storage] Set multiple:`, Object.keys(items));
}

/** Remove multiple values at once (sync) */
export function removeMultipleSync(keys: string[]): void {
  if (!hasLocalStorage()) return;
  keys.forEach((key) => localStorage.removeItem(key));
  if (isDev) console.log(`[Sync Storage] Removed multiple:`, keys);
}
