/**
 * Notification Sending Utilities
 * 
 * Helper functions for sending push notifications to parents via FCM
 */

import * as kv from './kv_store.tsx';

const API_BASE_INTERNAL = '/make-server-f116e23f';

/**
 * Send a push notification to a user via FCM
 * 
 * @param userId - User ID to send notification to
 * @param notification - Notification details
 */
export async function sendNotificationToUser(
  userId: string,
  notification: {
    title: string;
    body: string;
    data?: {
      type: 'prayer_approval' | 'reward_claim' | 'join_request' | 'milestone';
      childId?: string;
      itemId?: string;
      route?: string;
    };
  }
): Promise<void> {
  try {
    // Get user's push token
    const tokenData = await kv.get(`pushtoken:${userId}`);
    
    if (!tokenData || !tokenData.token) {
      console.log(`⚠️ No push token for user ${userId} - skipping notification`);
      return;
    }

    // Get FCM server key from environment
    const FCM_SERVER_KEY = Deno.env.get('FCM_SERVER_KEY');
    
    if (!FCM_SERVER_KEY) {
      console.warn('⚠️ FCM_SERVER_KEY not configured - notifications disabled');
      console.log('📬 Would send push notification:', {
        to: userId,
        token: tokenData.token.substring(0, 20) + '...',
        ...notification
      });
      return;
    }

    // Send via FCM
    console.log(`📬 Sending push notification to user ${userId}...`);
    
    const fcmResponse = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `key=${FCM_SERVER_KEY}`
      },
      body: JSON.stringify({
        to: tokenData.token,
        notification: {
          title: notification.title,
          body: notification.body,
          sound: 'default',
          badge: '1'
        },
        data: notification.data || {},
        priority: 'high',
        content_available: true
      })
    });

    if (!fcmResponse.ok) {
      const errorText = await fcmResponse.text();
      console.error('❌ Failed to send FCM notification:', errorText);
      throw new Error(`FCM error: ${errorText}`);
    }

    const fcmResult = await fcmResponse.json();
    console.log('✅ Push notification sent successfully:', fcmResult);

    // Update last used timestamp
    if (tokenData) {
      tokenData.lastUsed = new Date().toISOString();
      await kv.set(`pushtoken:${userId}`, tokenData);
    }
  } catch (error) {
    console.error('❌ Error sending notification:', error);
    // Don't throw - notifications are non-critical
  }
}

/**
 * Send notification to all parents in a family
 * 
 * @param familyId - Family ID
 * @param notification - Notification details
 */
export async function notifyFamilyParents(
  familyId: string,
  notification: {
    title: string;
    body: string;
    data?: {
      type: 'prayer_approval' | 'reward_claim' | 'join_request' | 'milestone';
      childId?: string;
      itemId?: string;
      route?: string;
    };
  }
): Promise<void> {
  try {
    // Get family
    const family = await kv.get(`family:${familyId}`);
    
    if (!family || !family.parentIds || family.parentIds.length === 0) {
      console.log(`⚠️ No parents found for family ${familyId}`);
      return;
    }

    // Send notification to each parent
    for (const parentId of family.parentIds) {
      await sendNotificationToUser(parentId, notification);
    }
  } catch (error) {
    console.error('Error notifying family parents:', error);
    // Don't throw - notifications are non-critical
  }
}