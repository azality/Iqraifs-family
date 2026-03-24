/**
 * Kid Session Guard
 * 
 * This module intercepts all fetch calls and automatically handles
 * expired kid sessions by clearing localStorage and redirecting.
 */

import { logoutKid } from './auth';

let isHandlingExpiredSession = false;

/**
 * Intercept fetch to catch 401 errors for kid sessions
 */
export function initKidSessionGuard() {
  const originalFetch = window.fetch;
  
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    
    // Check if this is a 401 Unauthorized response
    if (response.status === 401) {
      const mode = localStorage.getItem('user_mode');
      
      // Get authorization header - handle both plain object and Headers object
      let authHeader = '';
      if (args[1]?.headers) {
        if (typeof args[1].headers === 'object') {
          // Plain object
          authHeader = args[1].headers['Authorization'] || args[1].headers['authorization'] || '';
        } else if (args[1].headers instanceof Headers) {
          // Headers object
          authHeader = args[1].headers.get('Authorization') || '';
        }
      }
      
      // Check if this is a kid session (token starts with 'kid_')
      const isKidToken = authHeader.includes('Bearer kid_') || authHeader.includes('kid_');
      
      if (mode === 'kid' || isKidToken) {
        console.warn('🚨 Kid session 401 detected by global guard', {
          mode,
          isKidToken,
          url: args[0]
        });
        
        // Only handle once to prevent redirect loops
        if (!isHandlingExpiredSession) {
          isHandlingExpiredSession = true;
          
          console.log('🧹 Clearing expired kid session...');
          
          // Clear all kid session data
          logoutKid();
          
          console.log('🔄 Redirecting to kid login...');
          
          // Redirect to kid login
          setTimeout(() => {
            window.location.href = '/kid/login';
          }, 100);
        }
      }
    }
    
    return response;
  };
  
  console.log('✅ Kid session guard initialized');
}