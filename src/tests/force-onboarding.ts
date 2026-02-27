/**
 * Force Onboarding
 * 
 * Since you're already logged in, this skips the signup page
 * and takes you directly to onboarding to create your family
 */

export async function forceOnboarding() {
  console.log('🚀 ========================================');
  console.log('🚀 FORCING ONBOARDING NAVIGATION');
  console.log('🚀 ========================================\n');

  // Set the required localStorage values
  localStorage.setItem('user_role', 'parent');
  localStorage.setItem('user_mode', 'parent');

  console.log('✅ Set user_role = parent');
  console.log('✅ Set user_mode = parent\n');

  console.log('🔄 Reloading page to trigger onboarding flow...\n');
  console.log('⏳ Wait 2 seconds for page to reload...\n');

  // Force reload to trigger RequireFamily middleware
  // which will redirect to onboarding
  setTimeout(() => {
    window.location.reload();
  }, 500);

  return {
    success: true,
    message: 'Page will reload and redirect to onboarding'
  };
}
