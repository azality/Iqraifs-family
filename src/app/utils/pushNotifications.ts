/**
 * Push Notifications Utility
 * 
 * Handles device token registration, permission requests, and notification handling
 * for iOS push notifications.
 * 
 * BLOCKER #3: Push Notifications
 */

import { PushNotifications, Token, ActionPerformed } from '@capacitor/push-notifications';
import { projectId, publicAnonKey } from '../../../utils/supabase/info.tsx';
import { supabase } from '../../../utils/supabase/client';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f`;

export interface NotificationPayload {
  title: string;
  body: string;
  data?: {
    type: 'prayer_approval' | 'reward_claim' | 'join_request' | 'milestone';
    childId?: string;
    itemId?: string;
    route?: string;
  };
}

/**
 * Initialize push notifications
 * - Request permissions
 * - Register device token
 * - Setup notification listeners
 */
export async function initializePushNotifications(userId: string): Promise<void> {
  console.log('🔔 Initializing push notifications for user:', userId);

  try {
    // Request permission to use push notifications
    const permResult = await PushNotifications.requestPermissions();
    
    if (permResult.receive === 'granted') {
      console.log('✅ Push notification permission granted');
      
      // Register with Apple / Google to receive push via APNS/FCM
      await PushNotifications.register();
    } else {
      console.warn('⚠️ Push notification permission denied');
      throw new Error('Push notification permission denied');
    }

    // Listen for registration success
    await PushNotifications.addListener('registration', async (token: Token) => {
      console.log('✅ Push registration success, token:', token.value);
      
      // Save token to backend
      await savePushToken(userId, token.value);
    });

    // Listen for registration errors
    await PushNotifications.addListener('registrationError', (error: any) => {
      console.error('❌ Push registration error:', error);
    });

    // Listen for push notifications received while app is open
    await PushNotifications.addListener(
      'pushNotificationReceived',
      (notification) => {
        console.log('📬 Push notification received:', notification);
        // Notification is shown automatically by the system
        // You can show a custom in-app alert here if needed
      }
    );

    // Listen for push notification actions (tapped)
    await PushNotifications.addListener(
      'pushNotificationActionPerformed',
      (action: ActionPerformed) => {
        console.log('👆 Push notification action performed:', action);
        
        // Navigate to relevant page based on notification data
        handleNotificationTap(action);
      }
    );

    console.log('✅ Push notifications initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize push notifications:', error);
    throw error;
  }
}

/**
 * Save device push token to backend
 */
async function savePushToken(userId: string, token: string): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.access_token) {
      console.error('❌ No valid session for saving push token');
      return;
    }

    const response = await fetch(`${API_BASE}/notifications/register-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': publicAnonKey
      },
      body: JSON.stringify({ token })
    });

    if (!response.ok) {
      throw new Error('Failed to save push token');
    }

    console.log('✅ Push token saved to backend');
  } catch (error) {
    console.error('❌ Failed to save push token:', error);
  }
}

/**
 * Handle notification tap - navigate to relevant page
 */
function handleNotificationTap(action: ActionPerformed): void {
  const data = action.notification.data;
  
  if (!data) {
    console.log('No notification data, navigating to home');
    window.location.href = '/';
    return;
  }

  console.log('📍 Navigating based on notification type:', data.type);

  switch (data.type) {
    case 'prayer_approval':
      window.location.href = '/prayer-approvals';
      break;
    
    case 'reward_claim':
      window.location.href = '/redemption-requests';
      break;
    
    case 'join_request':
      window.location.href = '/settings'; // Family settings
      break;
    
    case 'milestone':
      window.location.href = '/'; // Dashboard to celebrate
      break;
    
    default:
      if (data.route) {
        window.location.href = data.route;
      } else {
        window.location.href = '/';
      }
  }
}

/**
 * Check if push notifications are supported on current platform
 */
export function isPushNotificationsSupported(): boolean {
  // Push notifications only work on iOS/Android, not web
  const isNativePlatform = window.matchMedia('(display-mode: standalone)').matches 
    || (window.navigator as any).standalone 
    || document.referrer.includes('android-app://');
  
  return isNativePlatform;
}

/**
 * Request push notification permissions
 * Returns true if granted, false if denied
 */
export async function requestPushPermissions(): Promise<boolean> {
  try {
    const result = await PushNotifications.requestPermissions();
    return result.receive === 'granted';
  } catch (error) {
    console.error('❌ Failed to request push permissions:', error);
    return false;
  }
}

/**
 * Check current push notification permission status
 */
export async function checkPushPermissions(): Promise<'granted' | 'denied' | 'prompt'> {
  try {
    const result = await PushNotifications.checkPermissions();
    return result.receive;
  } catch (error) {
    console.error('❌ Failed to check push permissions:', error);
    return 'denied';
  }
}

/**
 * Remove all push notification listeners (cleanup)
 */
export async function cleanupPushNotifications(): Promise<void> {
  try {
    await PushNotifications.removeAllListeners();
    console.log('✅ Push notification listeners removed');
  } catch (error) {
    console.error('❌ Failed to cleanup push notifications:', error);
  }
}