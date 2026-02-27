/**
 * Haptic Feedback Utilities for Mobile-First Experience
 * Provides tactile feedback on supported devices
 */

type HapticStyle = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

export const haptics = {
  /**
   * Trigger haptic feedback (if supported)
   */
  impact(style: HapticStyle = 'medium') {
    // Check if Haptic Feedback API is available (iOS Safari)
    if ('vibrate' in navigator) {
      switch (style) {
        case 'light':
          navigator.vibrate(10);
          break;
        case 'medium':
          navigator.vibrate(20);
          break;
        case 'heavy':
          navigator.vibrate(40);
          break;
        case 'success':
          navigator.vibrate([10, 50, 10]);
          break;
        case 'warning':
          navigator.vibrate([20, 100, 20]);
          break;
        case 'error':
          navigator.vibrate([40, 100, 40, 100, 40]);
          break;
      }
    }
  },

  /**
   * Selection feedback (light tap)
   */
  selection() {
    this.impact('light');
  },

  /**
   * Success feedback (double tap)
   */
  success() {
    this.impact('success');
  },

  /**
   * Error feedback (triple tap)
   */
  error() {
    this.impact('error');
  },

  /**
   * Warning feedback
   */
  warning() {
    this.impact('warning');
  },
};
