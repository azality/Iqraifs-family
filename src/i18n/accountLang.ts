// Account-level language persistence.
// The device remembers the language via localStorage (`fgs_lang`), but a
// teacher who logs in on a different device — or after a storage wipe —
// lost their اردو choice. So the choice is also stored on the Supabase
// account (user_metadata.lang) and re-applied on sign-in.
//
// Kid PIN sessions have no Supabase session; they keep the device-level
// setting only, which is fine (the device is the family's).

import { supabase } from '../../utils/supabase/client';
import { getCurrentLang, setCurrentLang, type Lang } from './index';

/** Save the chosen language on the signed-in account (no-op when logged out). */
export async function persistLangToAccount(lang: Lang): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await supabase.auth.updateUser({ data: { lang } });
  } catch {
    /* offline or no session — device-level localStorage still holds it */
  }
}

/**
 * Apply the account's saved language after sign-in. Live-switches via
 * i18next (no reload — a reload here could interrupt post-login
 * navigation). Only acts when the account has an explicit valid value
 * that differs from the device's current one.
 */
export function syncLangFromUser(
  user: { user_metadata?: Record<string, unknown> } | null | undefined,
): void {
  const saved = user?.user_metadata?.lang;
  if (saved !== 'en' && saved !== 'ur') return;
  if (saved === getCurrentLang()) return;
  setCurrentLang(saved);
}
