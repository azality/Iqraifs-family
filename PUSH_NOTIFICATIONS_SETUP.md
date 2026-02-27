# 🔔 Push Notifications Setup Guide

**Status:** ✅ Code 100% Complete | ⏳ Configuration Needed

## 📋 Overview

The push notification system is fully implemented with all code complete. You just need to configure Firebase Cloud Messaging (FCM) and iOS certificates to enable notifications.

**Estimated Time:** 2-4 hours (first time) | 30 minutes (if you've done it before)

---

## ✅ What's Already Done

- ✅ Capacitor Push Notifications plugin installed
- ✅ Frontend utilities complete (641 lines)
- ✅ Backend FCM integration active
- ✅ 4 notification API endpoints
- ✅ Settings UI integration
- ✅ Login initialization
- ✅ 3 notification triggers (prayer, rewards, join requests)
- ✅ Token registration system
- ✅ Automatic notification routing

---

## 🎯 What You Need to Do

### Part 1: Firebase Project Setup (15 minutes)

1. **Go to Firebase Console**
   - Visit: https://console.firebase.google.com/
   - Sign in with your Google account

2. **Create New Project**
   - Click "Add project"
   - Project name: `FGS-Production` (or your preferred name)
   - Disable Google Analytics (optional for this use case)
   - Click "Create project"

3. **Add iOS App**
   - Click the iOS icon
   - iOS bundle ID: `com.fgs.parent` (match your capacitor.config.ts)
   - App nickname: `FGS Parent App`
   - App Store ID: (leave blank for now)
   - Click "Register app"

4. **Download GoogleService-Info.plist**
   - Download the file
   - **IMPORTANT:** Save it, you'll need it in Part 3

5. **Enable Cloud Messaging**
   - In Firebase Console, click the gear icon ⚙️ → Project settings
   - Go to "Cloud Messaging" tab
   - Copy the **Server key** (looks like `AAAAxxxxxxxx...`)
   - Save this key - you'll need it for Part 2

---

### Part 2: Add FCM Server Key to Supabase (5 minutes)

1. **Open Supabase Dashboard**
   - Go to: https://supabase.com/dashboard
   - Select your FGS project

2. **Navigate to Edge Functions Settings**
   - Click "Edge Functions" in left sidebar
   - Click "Manage secrets" or "Environment variables"

3. **Add FCM_SERVER_KEY**
   - Click "Add new secret"
   - Name: `FCM_SERVER_KEY`
   - Value: Paste the Server key from Firebase (Part 1, Step 5)
   - Click "Save"

4. **Redeploy Edge Function**
   - The environment variable will be available after redeploying
   - Your backend will now send actual push notifications!

---

### Part 3: iOS Push Notification Certificates (1-2 hours)

**Prerequisites:**
- Apple Developer Account ($99/year)
- Physical iPhone for testing
- Mac computer with Xcode

#### Step 3.1: Create App Identifier

1. Go to: https://developer.apple.com/account/
2. Navigate to: Certificates, Identifiers & Profiles
3. Click "Identifiers" → "+" button
4. Select "App IDs" → Continue
5. App ID Details:
   - Description: `FGS Parent App`
   - Bundle ID: `com.fgs.parent` (must match exactly)
   - Capabilities: Check "Push Notifications"
6. Click "Continue" → "Register"

#### Step 3.2: Create APNs Authentication Key

**Option A: Authentication Key (Recommended - Easier)**

1. Go to: Certificates, Identifiers & Profiles
2. Click "Keys" → "+" button
3. Key Name: `FGS Push Notifications Key`
4. Check "Apple Push Notifications service (APNs)"
5. Click "Continue" → "Register"
6. **Download the .p8 file** (you can only download once!)
7. Note the Key ID (10-character string)
8. Note your Team ID (found in top-right of developer portal)

**Option B: APNs Certificate (Traditional)**

1. On your Mac, open Keychain Access
2. Menu: Keychain Access → Certificate Assistant → Request Certificate from CA
3. Email: your email
4. Common Name: `FGS Push Certificate`
5. Save to disk
6. In Apple Developer Portal:
   - Go to Certificates → "+" button
   - Select "Apple Push Notification service SSL (Sandbox & Production)"
   - Choose App ID: `com.fgs.parent`
   - Upload the CSR file
   - Download the .cer file
7. Double-click .cer file to add to Keychain
8. Export as .p12 file (you'll need the password)

#### Step 3.3: Configure Firebase with APNs

1. **Go back to Firebase Console**
   - Project Settings → Cloud Messaging tab
   - Scroll to "iOS app configuration"

2. **If using Authentication Key (.p8):**
   - Click "Upload" under APNs Authentication Key
   - Upload your .p8 file
   - Enter Key ID
   - Enter Team ID
   - Click "Upload"

3. **If using Certificate (.p12):**
   - Click "Upload" under APNs Certificates
   - Upload your .p12 file
   - Enter password
   - Select "Development" or "Production" mode
   - Click "Upload"

---

### Part 4: Add GoogleService-Info.plist to Xcode (15 minutes)

1. **Build the iOS app first:**
   ```bash
   npm run cap:sync:parent
   ```

2. **Open Xcode:**
   ```bash
   npm run cap:open:ios
   ```

3. **Add GoogleService-Info.plist:**
   - Locate the file you downloaded in Part 1, Step 4
   - Drag it into Xcode project navigator
   - Place it in the `App` folder (same level as `Info.plist`)
   - ✅ Check "Copy items if needed"
   - ✅ Check "Add to targets: App"
   - Click "Finish"

4. **Verify it's added:**
   - Select the file in Xcode
   - In right panel, ensure "Target Membership" shows `App` is checked

5. **Enable Push Notifications Capability:**
   - Select your project in Xcode
   - Select the "App" target
   - Go to "Signing & Capabilities" tab
   - Click "+ Capability"
   - Add "Push Notifications"
   - Add "Background Modes" → Check "Remote notifications"

6. **Build again:**
   ```bash
   npm run cap:sync:parent
   ```

---

### Part 5: Testing on Physical Device (1-2 hours)

**IMPORTANT:** Push notifications do NOT work on iOS Simulator. You MUST use a physical device.

#### Step 5.1: Connect iPhone

1. Plug iPhone into Mac via USB cable
2. Trust the computer on your iPhone
3. In Xcode, select your iPhone from the device dropdown (top bar)

#### Step 5.2: Configure Signing

1. Select project → App target → Signing & Capabilities
2. Team: Select your Apple Developer team
3. Xcode will automatically create provisioning profile

#### Step 5.3: Run on Device

1. Click the ▶️ Play button in Xcode
2. App will install on your iPhone
3. If prompted, go to iPhone Settings → General → VPN & Device Management → Trust your developer account

#### Step 5.4: Test Push Notifications

1. **Login to parent account**
   - App should request push notification permission
   - Tap "Allow"
   - Check Settings tab to verify "Notifications Enabled ✓"

2. **Trigger a notification:**
   - Login to kid account on another device/browser
   - Log a prayer (e.g., Fajr)
   - Parent should receive push notification within 1-2 seconds

3. **Tap the notification:**
   - Should open app to Prayer Approvals page

4. **Check logs:**
   - In Xcode, View → Debug Area → Show Debug Area
   - Look for: "✅ Push registration success, token: ..."
   - Look for: "📬 Push notification received: ..."

---

## 🔍 Troubleshooting

### "No push token registered"

**Cause:** App didn't successfully register with APNs/FCM

**Solutions:**
1. Verify GoogleService-Info.plist is in Xcode project
2. Check Push Notifications capability is enabled
3. Ensure you're testing on physical device (not simulator)
4. Check Xcode console for errors during app launch
5. Try uninstalling and reinstalling the app

---

### "FCM registration error"

**Cause:** Firebase configuration issue

**Solutions:**
1. Verify Bundle ID matches exactly: `com.fgs.parent`
2. Verify GoogleService-Info.plist is for correct Firebase project
3. Check Firebase project has iOS app configured
4. Ensure APNs key/certificate is uploaded to Firebase

---

### "Permission denied"

**Cause:** User declined push notification permission

**Solutions:**
1. Go to iPhone Settings → FGS Parent → Notifications
2. Enable "Allow Notifications"
3. Restart the app
4. App will re-register for push

---

### "Notification sent but not received"

**Cause:** APNs certificate issue or FCM server key wrong

**Solutions:**
1. Check Supabase logs for FCM errors
2. Verify FCM_SERVER_KEY is correct in Supabase
3. Verify APNs key/certificate is uploaded to Firebase
4. Check Firebase → Cloud Messaging → iOS configuration
5. Ensure certificate is for correct bundle ID
6. Try creating new APNs certificate

---

### "Token saved but notifications not sending"

**Cause:** Backend FCM integration issue

**Solutions:**
1. Check Supabase Edge Function logs
2. Verify FCM_SERVER_KEY environment variable exists
3. Look for "❌ Failed to send FCM notification" errors
4. FCM API might be returning error - check logs for details

---

## 📊 Verification Checklist

Before considering push notifications complete, verify:

- [ ] Firebase project created
- [ ] iOS app added to Firebase with correct Bundle ID
- [ ] FCM Server key added to Supabase environment variables
- [ ] APNs Authentication Key (.p8) OR Certificate (.p12) created
- [ ] APNs credentials uploaded to Firebase Cloud Messaging
- [ ] GoogleService-Info.plist added to Xcode project
- [ ] Push Notifications capability enabled in Xcode
- [ ] Background Modes → Remote notifications enabled in Xcode
- [ ] App tested on physical iPhone (not simulator)
- [ ] App requests and receives push permission on login
- [ ] Token successfully registered (check Settings tab)
- [ ] Test notification received when kid logs prayer
- [ ] Notification tap opens correct page in app
- [ ] Supabase logs show "✅ Push notification sent successfully"

---

## 🎉 Success Criteria

You'll know push notifications are working when:

1. ✅ Parent logs in → sees "Notifications Enabled ✓" in Settings
2. ✅ Kid logs prayer → Parent receives notification within 1-2 seconds
3. ✅ Parent taps notification → App opens to Prayer Approvals page
4. ✅ Supabase logs show: "✅ Push notification sent successfully"
5. ✅ No errors in Xcode console

---

## 📱 Testing All Notification Types

Once setup is complete, test all 4 notification types:

### 1. Prayer Approval Request
- Kid logs prayer
- Parent gets: "🕌 Prayer approval needed"
- Taps → Opens Prayer Approvals page

### 2. Reward Redemption Request
- Kid redeems reward from wishlist
- Parent gets: "🎁 Reward redemption request"
- Taps → Opens Redemption Requests page

### 3. Join Request
- New user requests to join family
- Parent gets: "👨‍👩‍👧‍👦 New family join request"
- Taps → Opens Settings (Family section)

### 4. Milestone Achievement
- Kid reaches milestone (100 points, 50 prayers, etc.)
- Parent gets: "🎉 [Child name] reached a milestone!"
- Taps → Opens Dashboard to celebrate

---

## 🚀 After Setup Complete

Once all tests pass:

1. **Update this status document:**
   - Change status to: ✅ 100% Complete
   - Add completion date

2. **Repeat for Kids app** (if kids app also needs push):
   - Same process but use Bundle ID: `com.fgs.kids`
   - Create separate App ID in Apple Developer
   - Add second iOS app to Firebase
   - Download separate GoogleService-Info.plist

3. **Monitor in production:**
   - Check Supabase logs weekly for FCM errors
   - Monitor notification delivery rates in Firebase Console
   - APNs certificates expire - set reminder to renew

---

## 🔐 Security Notes

- ✅ FCM_SERVER_KEY is stored securely in Supabase environment (never in code)
- ✅ Push tokens are user-specific and auto-expire
- ✅ Backend validates user auth before sending notifications
- ✅ Notifications only sent to family parents (not kids)
- ✅ No sensitive data included in notification body (only titles)

---

## 📚 Reference Links

- **Firebase Console:** https://console.firebase.google.com/
- **Apple Developer Portal:** https://developer.apple.com/account/
- **Capacitor Push Notifications Docs:** https://capacitorjs.com/docs/apis/push-notifications
- **FCM iOS Setup Guide:** https://firebase.google.com/docs/cloud-messaging/ios/client
- **APNs Overview:** https://developer.apple.com/documentation/usernotifications

---

## ⏱️ Time Estimates

| Task | First Time | Experienced |
|------|-----------|-------------|
| Firebase project setup | 15 min | 5 min |
| Add FCM key to Supabase | 5 min | 2 min |
| Create APNs certificate | 60 min | 15 min |
| Add to Xcode | 15 min | 5 min |
| Physical device testing | 60 min | 15 min |
| **TOTAL** | **2.5 hours** | **42 minutes** |

---

**Last Updated:** February 22, 2026  
**Status:** ✅ Code Complete | ⏳ Configuration Needed  
**Blockers:** None - Just need to follow this guide  
**Deployment Impact:** Optional for beta, recommended for v1.0
