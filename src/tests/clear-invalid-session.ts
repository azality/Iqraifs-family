/**
 * Clear Invalid Session
 * 
 * Clears browser session when user account has been deleted
 * but session token still exists
 */

export async function clearInvalidSession() {
  console.log('🔄 ========================================');
  console.log('🔄 CLEARING INVALID SESSION');
  console.log('🔄 ========================================\n');

  try {
    // Import Supabase client
    const { createClient } = await import('/utils/supabase/client');
    const supabase = createClient();

    // Sign out (clears session)
    console.log('📝 Step 1: Signing out from Supabase...');
    await supabase.auth.signOut();
    console.log('   ✅ Signed out from Supabase\n');

    // Clear localStorage
    console.log('📝 Step 2: Clearing localStorage...');
    const keysToRemove = [
      'user_role',
      'user_mode',
      'fgs_test_environment',
      'sb-ybrkbrrkcqpzpjnjdyib-auth-token' // Supabase session key
    ];

    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
      console.log(`   ✅ Removed: ${key}`);
    });

    // Clear all Supabase session storage
    const allKeys = Object.keys(localStorage);
    const supabaseKeys = allKeys.filter(key => 
      key.startsWith('sb-') || 
      key.includes('supabase') ||
      key.includes('auth-token')
    );

    supabaseKeys.forEach(key => {
      localStorage.removeItem(key);
      console.log(`   ✅ Removed: ${key}`);
    });

    console.log('\n✅ Session cleared successfully!\n');
    
    console.log('🔄 Step 3: Reloading page...');
    console.log('   You will be redirected to login/signup\n');

    // Reload page after a short delay
    setTimeout(() => {
      window.location.href = '/';
    }, 1000);

    return {
      success: true,
      message: 'Session cleared. Reloading page...',
      clearedKeys: [...keysToRemove, ...supabaseKeys]
    };

  } catch (error: any) {
    console.error('❌ Error clearing session:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
