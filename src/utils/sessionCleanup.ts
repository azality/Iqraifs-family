// This module MUST be imported before Supabase client to ensure cleanup happens first
export function checkAndCleanCorruptedSessions() {
  try {
    // CRITICAL: Check if user is in kid mode FIRST - don't clean kid sessions!
    const userRole = localStorage.getItem('user_role');
    if (userRole === 'child') {
      console.log('👶 Kid mode detected - skipping session cleanup to preserve kid session');
      return false;
    }
    
    // Check all localStorage keys related to Supabase
    const keys = Object.keys(localStorage);
    const supabaseKeys = keys.filter(k => k.includes('sb-') || k.includes('supabase'));
    
    let foundCorruption = false;
    
    for (const key of supabaseKeys) {
      const value = localStorage.getItem(key);
      
      // Check if any Supabase keys contain the string "null" as token
      if (value && (value.includes('"access_token":"null"') || value.includes('"access_token":null'))) {
        console.error('❌ Found corrupted Supabase session in', key, '- cleaning up');
        foundCorruption = true;
        break;
      }
    }
    
    if (foundCorruption) {
      console.log('🧹 CRITICAL: Clearing all corrupted Supabase sessions BEFORE app init');
      // Clear all localStorage immediately
      supabaseKeys.forEach(key => {
        try {
          localStorage.removeItem(key);
        } catch (e) {
          console.error('Failed to remove key', key, e);
        }
      });
      
      // Also clear FGS keys to force fresh login
      localStorage.removeItem('fgs_user_id');
      localStorage.removeItem('user_role');
      localStorage.removeItem('user_name');
      localStorage.removeItem('fgs_user_name');
      localStorage.removeItem('user_email');
      localStorage.removeItem('fgs_family_id');
      localStorage.removeItem('kid_session_token');
      localStorage.removeItem('child_id');
      
      console.log('✅ Session cleanup complete - redirecting to login');
      return true; // Corruption was found and cleaned
    }
    
    return false; // No corruption found
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