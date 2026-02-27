# 🧪 Push Notifications Testing Guide

**Purpose:** Verify push notifications are working correctly after FCM setup

---

## ✅ Pre-Test Checklist

Before testing, confirm:

- [ ] FCM_SERVER_KEY added to Supabase environment
- [ ] GoogleService-Info.plist in Xcode project
- [ ] Push Notifications capability enabled in Xcode
- [ ] APNs key uploaded to Firebase
- [ ] App installed on physical iPhone (not simulator)
- [ ] Parent logged in to FGS Parent app

---

## 🧪 Test Suite

### Test 1: Token Registration ⭐ CRITICAL

**Goal:** Verify app registers for push notifications

**Steps:**
1. Open FGS Parent app on iPhone
2. Login as parent
3. Check Xcode console logs

**Expected Results:**
```
🔔 Initializing push notifications for user: [userId]
✅ Push notification permission granted
✅ Push registration success, token: [long token string]
✅ Push token saved to backend
✅ Push notifications initialized successfully
```

**In App:**
- Navigate to Settings tab
- Should show: "🔔 Notifications Enabled ✓"
- Should NOT show error message

**Pass Criteria:** ✅ Token appears in logs, Settings shows enabled

**If Failed:**
- Check GoogleService-Info.plist is in project
- Verify Push Notifications capability enabled
- Try uninstalling and reinstalling app
- Check Supabase logs for errors

---

### Test 2: Prayer Approval Notification ⭐ CRITICAL

**Goal:** Parent receives notification when kid logs prayer

**Setup:**
1. Parent logged in on iPhone
2. Kid logged in on different device/browser

**Steps:**
1. As kid: Navigate to Prayer Logging
2. As kid: Log "Fajr" prayer
3. As kid: Submit

**Expected Results:**

**On Kid Side:**
- Prayer logged successfully
- Shows "Pending approval"

**On Parent iPhone:**
- Within 1-2 seconds, notification appears:
  - Title: "🕌 Prayer approval needed"
  - Body: "[Child name] logged Fajr prayer"
- Notification sound plays
- Badge appears on app icon

**In Supabase Logs:**
```
📬 Sending push notification to user [parentId]...
✅ Push notification sent successfully: { success: 1, ... }
```

**When Tapped:**
- App opens to Prayer Approvals page
- Shows kid's pending prayer

**Pass Criteria:** ✅ Notification received, tap opens correct page

**If Failed:**
- Check FCM_SERVER_KEY in Supabase
- Look for errors in Supabase logs
- Verify APNs key in Firebase
- Check kid is in same family as parent

---

### Test 3: Reward Redemption Notification ⭐ CRITICAL

**Goal:** Parent receives notification when kid redeems reward

**Setup:**
1. Ensure kid has enough points for a reward
2. Parent logged in on iPhone

**Steps:**
1. As kid: Navigate to Rewards
2. As kid: Add reward to wishlist
3. As kid: Redeem reward

**Expected Results:**

**On Parent iPhone:**
- Notification appears:
  - Title: "🎁 Reward redemption request"
  - Body: "[Child name] wants to redeem: [Reward name]"
- Notification sound plays

**In Supabase Logs:**
```
📬 Sending push notification to user [parentId]...
✅ Push notification sent successfully
```

**When Tapped:**
- App opens to Redemption Requests page
- Shows kid's pending redemption

**Pass Criteria:** ✅ Notification received, navigation works

---

### Test 4: Join Request Notification

**Goal:** Parent receives notification when someone wants to join family

**Setup:**
1. Create test user account
2. Get parent's family invite code

**Steps:**
1. As test user: Request to join family
2. Check parent's iPhone

**Expected Results:**

**On Parent iPhone:**
- Notification appears:
  - Title: "👨‍👩‍👧‍👦 New family join request"
  - Body: "[Name] wants to join your family"

**When Tapped:**
- App opens to Settings page
- Family section shows pending request

**Pass Criteria:** ✅ Notification received

---

### Test 5: Milestone Notification

**Goal:** Parent receives notification when kid achieves milestone

**Setup:**
1. Kid close to a milestone (e.g., 99 points, need 1 more for 100)

**Steps:**
1. As parent: Approve a prayer to push kid over milestone
2. Check iPhone

**Expected Results:**

**On Parent iPhone:**
- Notification appears:
  - Title: "🎉 Milestone reached!"
  - Body: "[Child name] earned 100 total points! 🌟"

**When Tapped:**
- App opens to Dashboard
- Shows celebration/achievement

**Pass Criteria:** ✅ Notification received

---

### Test 6: App Backgrounded

**Goal:** Notifications work when app is closed/backgrounded

**Steps:**
1. Close FGS Parent app (swipe up in app switcher)
2. As kid: Log a prayer
3. Check iPhone lock screen

**Expected Results:**
- Notification appears on lock screen
- Badge appears on app icon
- Notification visible in Notification Center

**Pass Criteria:** ✅ Works when app closed

---

### Test 7: Multiple Parents

**Goal:** All parents in family receive notification

**Setup:**
1. Family with 2+ parents
2. Both parents logged in on different devices

**Steps:**
1. As kid: Log prayer
2. Check both parent devices

**Expected Results:**
- All parents receive notification
- All within 1-2 seconds

**Pass Criteria:** ✅ All parents notified

---

### Test 8: Permission Denied Recovery

**Goal:** App handles permission denial gracefully

**Steps:**
1. iPhone Settings → FGS Parent → Notifications → OFF
2. Restart app
3. Check Settings tab

**Expected Results:**
- Settings shows: "⚠️ Notifications Disabled"
- App still works normally
- Can re-enable via "Enable Notifications" button

**Pass Criteria:** ✅ Graceful handling

---

### Test 9: Token Refresh

**Goal:** Token updates if device token changes

**Steps:**
1. Login as parent
2. Check Settings for token registration
3. Logout and login again
4. Check if new token registered

**Expected Results:**
- Fresh token registered each login
- Old token updated in backend

**Pass Criteria:** ✅ Token updates successfully

---

### Test 10: Error Handling

**Goal:** System handles FCM errors gracefully

**Steps:**
1. Temporarily remove FCM_SERVER_KEY from Supabase
2. As kid: Log prayer
3. Check Supabase logs

**Expected Results:**
```
⚠️ FCM_SERVER_KEY not configured - notifications disabled
📬 Would send push notification: { ... }
```

- Kid's action still completes successfully
- Parent doesn't get notification
- No crashes

**Pass Criteria:** ✅ Degrades gracefully

---

## 📊 Test Results Template

Copy and fill out after testing:

```
PUSH NOTIFICATIONS TEST RESULTS
================================
Date: __________
Tester: __________
Device: iPhone [model], iOS [version]
App Build: __________

Test 1: Token Registration         [ ] PASS  [ ] FAIL
Test 2: Prayer Approval Notification[ ] PASS  [ ] FAIL
Test 3: Reward Redemption          [ ] PASS  [ ] FAIL
Test 4: Join Request               [ ] PASS  [ ] FAIL
Test 5: Milestone                  [ ] PASS  [ ] FAIL
Test 6: App Backgrounded           [ ] PASS  [ ] FAIL
Test 7: Multiple Parents           [ ] PASS  [ ] FAIL
Test 8: Permission Denied          [ ] PASS  [ ] FAIL
Test 9: Token Refresh              [ ] PASS  [ ] FAIL
Test 10: Error Handling            [ ] PASS  [ ] FAIL

Overall: [ ] ALL PASS  [ ] SOME FAILURES

Notes:
_________________________________
_________________________________
_________________________________
```

---

## 🐛 Common Issues & Fixes

### Issue: "Permission denied"

**Symptoms:** App doesn't request notification permission

**Fix:**
1. Uninstall app completely
2. Reinstall from Xcode
3. On first launch, should request permission

---

### Issue: "Token not registering"

**Symptoms:** Settings shows "Notifications Disabled ✗"

**Fix:**
1. Check GoogleService-Info.plist is in project
2. Verify Bundle ID matches Firebase
3. Check Xcode console for errors
4. Ensure using physical device (not simulator)

---

### Issue: "Notification not received"

**Symptoms:** Token registered but no notification appears

**Fix:**
1. Check Supabase logs for FCM errors
2. Verify FCM_SERVER_KEY is correct
3. Check APNs key uploaded to Firebase
4. Ensure iPhone has internet connection
5. Try sending test from Firebase Console

---

### Issue: "Notification received but tap doesn't navigate"

**Symptoms:** Notification appears but tapping doesn't open correct page

**Fix:**
1. Check notification data payload in logs
2. Verify route exists in app
3. Check handleNotificationTap() function

---

### Issue: "Works in development, fails in production"

**Symptoms:** TestFlight build doesn't receive notifications

**Fix:**
1. Ensure APNs certificate is for Production (not just Development)
2. Upload production certificate to Firebase
3. Rebuild with Release configuration

---

## 🎯 Success Criteria

Push notifications are fully working when:

- ✅ All 10 tests pass
- ✅ Notifications received within 1-2 seconds
- ✅ All notification types work
- ✅ Tap navigation works correctly
- ✅ Works when app backgrounded
- ✅ Multiple parents receive notifications
- ✅ No errors in Supabase logs
- ✅ No crashes in Xcode

---

## 📈 Performance Benchmarks

**Expected Performance:**
- Token registration: < 3 seconds
- Notification delivery: 1-2 seconds
- Tap-to-open: < 1 second
- Success rate: > 95%

**If Performance Issues:**
- Check internet connection
- Verify FCM server is not rate limiting
- Check Supabase edge function response time
- Monitor Firebase Analytics for delivery rates

---

## 🔍 Debugging Tools

### Xcode Console
View real-time logs from device:
- Xcode → Window → Devices and Simulators
- Select iPhone → Open Console
- Filter: "push" or "notification"

### Supabase Logs
View backend logs:
- Supabase Dashboard → Edge Functions → Logs
- Filter: "notification" or "FCM"

### Firebase Console
View notification analytics:
- Firebase Console → Cloud Messaging
- Check delivery rates
- View error logs

### iPhone Settings
Check app notification status:
- Settings → Notifications → FGS Parent
- Verify enabled
- Check delivery type: Immediate

---

## 📝 After Testing Complete

Once all tests pass:

1. **Document results:**
   - Fill out test results template
   - Save to project docs
   - Note any issues encountered

2. **Update deployment status:**
   - Mark push notifications as 100% complete
   - Update DEPLOYMENT_STATUS.md

3. **Proceed to TestFlight:**
   - Upload build to TestFlight
   - Invite beta testers
   - Have them run same tests

4. **Monitor in production:**
   - Watch Supabase logs first week
   - Check FCM delivery rates
   - Address any issues immediately

---

**Ready to test? Connect your iPhone and let's go! 🚀**
