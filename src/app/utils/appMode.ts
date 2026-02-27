/**
 * App Mode Detection Utility
 * 
 * Detects which iOS app is running (Parent or Kids) based on build-time
 * environment variables. This enables route isolation between apps.
 * 
 * SECURITY: Critical for preventing kids from accessing parent routes
 */

export type AppMode = 'parent' | 'kids' | 'web';

/**
 * Get the current app mode from Vite environment variable
 * 
 * @returns 'parent' for Parent app, 'kids' for Kids app, 'web' for browser
 */
export function getAppMode(): AppMode {
  // Check Vite environment variable (set during build)
  const viteAppMode = import.meta.env.VITE_APP_MODE;
  
  if (viteAppMode === 'parent') {
    return 'parent';
  }
  
  if (viteAppMode === 'kids') {
    return 'kids';
  }
  
  // Default to web mode for browser/development
  return 'web';
}

/**
 * Check if running in Parent app
 */
export function isParentApp(): boolean {
  return getAppMode() === 'parent';
}

/**
 * Check if running in Kids app
 */
export function isKidsApp(): boolean {
  return getAppMode() === 'kids';
}

/**
 * Check if running in web browser (not iOS app)
 */
export function isWebApp(): boolean {
  return getAppMode() === 'web';
}

/**
 * Get the default landing route for current app mode
 */
export function getDefaultRoute(): string {
  const mode = getAppMode();
  
  switch (mode) {
    case 'parent':
      return '/';
    case 'kids':
      return '/kid/login';
    case 'web':
    default:
      return '/welcome';
  }
}

/**
 * Check if a route is allowed in the current app mode
 * 
 * @param path - Route path to check
 * @returns true if route is allowed in current app
 */
export function isRouteAllowed(path: string): boolean {
  const mode = getAppMode();
  
  // Web mode: Allow all routes (for development/testing)
  if (mode === 'web') {
    return true;
  }
  
  // Parent app: Block all kid routes
  if (mode === 'parent') {
    const kidRoutes = ['/kid/home', '/kid/wishlist', '/kid/prayers'];
    return !kidRoutes.some(route => path.startsWith(route) || path === route);
  }
  
  // Kids app: Block all parent routes
  if (mode === 'kids') {
    const parentRoutes = [
      '/log',
      '/review',
      '/adjustments',
      '/attendance',
      '/rewards',
      '/audit',
      '/settings',
      '/edit-requests',
      '/wishlist',
      '/redemption-requests',
      '/prayer-approvals',
      '/login',
      '/parent-login',
      '/signup',
      '/onboarding'
    ];
    return !parentRoutes.some(route => path === route || path.startsWith(route));
  }
  
  return true;
}

// Log app mode on module load (for debugging)
console.log('🎯 App Mode:', getAppMode());
console.log('📱 VITE_APP_MODE:', import.meta.env.VITE_APP_MODE);