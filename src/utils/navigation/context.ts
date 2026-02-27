/**
 * Navigation Context
 * 
 * Provides global access to navigation state for testing purposes.
 * Allows tests to verify which role mode the app is currently in.
 */

export interface NavigationContext {
  role: 'parent' | 'kid' | null;
  childId?: string;
  userId?: string;
}

export let navigationContext: NavigationContext = {
  role: null
};

export function setNavigationContext(context: Partial<NavigationContext>) {
  navigationContext = {
    ...navigationContext,
    ...context
  };
}

export function resetNavigationContext() {
  navigationContext = {
    role: null
  };
}

// Make it globally accessible for tests
if (typeof window !== 'undefined') {
  (window as any).navigationContext = navigationContext;
  (window as any).setNavigationContext = setNavigationContext;
}
