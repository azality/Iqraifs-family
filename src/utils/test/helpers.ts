/**
 * Test Helpers
 * 
 * Utility functions for testing navigation and app behavior.
 */

import { useNavigate } from 'react-router';

/**
 * Sleep for specified milliseconds
 */
async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Navigate to a specific route
 * This is a wrapper that works in test context
 */
async function navigate(path: string): Promise<void> {
  // Use the browser's history API directly for testing
  if (typeof window !== 'undefined' && window.history) {
    window.history.pushState({}, '', path);
    
    // Trigger a popstate event to notify React Router
    window.dispatchEvent(new PopStateEvent('popstate'));
    
    // Give React Router time to process the route change
    await sleep(100);
  }
}

/**
 * Wait for a condition to be true
 */
async function waitFor(
  condition: () => boolean,
  options: {
    timeout?: number;
    interval?: number;
  } = {}
): Promise<void> {
  const { timeout = 5000, interval = 100 } = options;
  const startTime = Date.now();
  
  while (!condition()) {
    if (Date.now() - startTime > timeout) {
      throw new Error('Timeout waiting for condition');
    }
    await sleep(interval);
  }
}

/**
 * Get current route path
 */
function getCurrentPath(): string {
  return typeof window !== 'undefined' ? window.location.pathname : '/';
}

export const testHelpers = {
  sleep,
  navigate,
  waitFor,
  getCurrentPath
};

// Make it globally accessible for browser console testing
if (typeof window !== 'undefined') {
  (window as any).testHelpers = testHelpers;
}
