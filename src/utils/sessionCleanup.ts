// This module MUST be imported before Supabase client to ensure cleanup happens first.
//
// NOTE on raw localStorage use in this file:
// Supabase's default storage adapter persists its session blob to
// window.localStorage, so to detect and clean corrupt Supabase sessions we
// must read/write window.localStorage directly. That is the specific purpose
// of this module, and is the one authorised escape hatch in the codebase
// outside of src/utils/storage.ts. FGS keys are cleaned via the shared
// async storage abstraction below.

import { removeMultiple } from './storage';

// Keys owned by this app that should be wiped alongside a corrupted Supabase
// session. Routed through the async storage abstraction so that both web
// localStorage and native Capacitor Preferences are cleared.
const FGS_KEYS_TO_CLEAR = [
  'fgs_user_id',
  'user_role',
  'user_name',
  'fgs_user_name',
  'user_email',
  'fgs_family_id',
  'kid_session_token',
  'child_id',
];

export function checkAndCleanCorruptedSessions() {
  try {
    // CRITICAL: Check if user is in kid mode FIRST - don't clean kid sessions!
    // This runs at module import time before React mounts, so the fast sync
    // localStorage check is acceptable (and on native the kid session is
    // also mirrored to localStorage by the auth code).
    // eslint-disable-next-line no-restricted-globals
    const userRole = window.localStorage.getItem('user_role');
    if (userRole === 'child') {
      console.log('👶 Kid mode detected - skipping session cleanup to preserve kid session');
      return false;
    }

    // Inspect raw localStorage for Supabase session corruption (see note at top of file).
    const keys = Object.keys(window.localStorage);
    const supabaseKeys = keys.filter((k) => k.includes('sb-') || k.includes('supabase'));

    let foundCorruption = false;

    for (const key of supabaseKeys) {
      const value = window.localStorage.getItem(key);

      if (
        value &&
        (value.includes('"access_token":"null"') || value.includes('"access_token":null'))
      ) {
        console.error('❌ Found corrupted Supabase session in', key, '- cleaning up');
        foundCorruption = true;
        break;
      }
    }

    if (foundCorruption) {
      console.log('🧹 CRITICAL: Clearing all corrupted Supabase sessions BEFORE app init');
      // Clear raw Supabase localStorage entries synchronously (must happen before
      // Supabase client initialises).
      supabaseKeys.forEach((key) => {
        try {
          window.localStorage.removeItem(key);
        } catch (e) {
          console.error('Failed to remove key', key, e);
        }
      });

      // FGS keys go through the async abstraction so native Preferences are also wiped.
      // Fire-and-forget: redirect is already triggered below.
      void removeMultiple(FGS_KEYS_TO_CLEAR).catch((e) =>
        console.error('Error clearing FGS keys via async storage:', e),
      );

      console.log('✅ Session cleanup complete - redirecting to login');
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error during session cleanup:', error);
    return false;
  }
}

// Run cleanup immediately when this module is imported
const needsRedirect = checkAndCleanCorruptedSessions();
if (needsRedirect) {
  // Redirect immediately before any React rendering
  window.location.href = '/parent-login';
}
