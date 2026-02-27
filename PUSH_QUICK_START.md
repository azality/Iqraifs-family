# ⚡ Push Notifications - Quick Start Checklist

**Time Required:** 2-4 hours  
**Status:** ✅ All code complete - just configuration needed

---

## 🎯 Step-by-Step Checklist

### ☐ Step 1: Firebase Setup (15 min)

1. Go to https://console.firebase.google.com/
2. Create project: `FGS-Production`
3. Add iOS app with Bundle ID: `com.fgs.parent`
4. Download `GoogleService-Info.plist`
5. Copy **FCM Server Key** from Project Settings → Cloud Messaging

---

### ☐ Step 2: Supabase Configuration (2 min)

1. Open https://supabase.com/dashboard → Your FGS project
2. Edge Functions → Manage secrets
3. Add new secret:
   - Name: `FCM_SERVER_KEY`
   - Value: [paste from Step 1.5]
4. Save

**✅ Backend is now ready to send push notifications!**

---

### ☐ Step 3: Apple Developer Setup (60 min)

1. Go to https://developer.apple.com/account/
2. Create App ID:
   - Bundle ID: `com.fgs.parent`
   - Enable: Push Notifications
3. Create APNs Authentication Key:
   - Download `.p8` file
   - Save Key ID and Team ID
4. Upload to Firebase:
   - Firebase → Cloud Messaging → APNs Authentication Key
   - Upload `.p8` + enter Key ID + Team ID

**✅ iOS push certificates configured!**

---

### ☐ Step 4: Xcode Setup (15 min)

1. Build iOS app:
   ```bash
   npm run cap:sync:parent
   npm run cap:open:ios
   ```

2. Add `GoogleService-Info.plist` to Xcode:
   - Drag file into `App` folder
   - Check "Copy items if needed"
   - Check "Add to targets: App"

3. Enable capabilities:
   - Push Notifications
   - Background Modes → Remote notifications

4. Rebuild:
   ```bash
   npm run cap:sync:parent
   ```

**✅ Xcode project configured!**

---

### ☐ Step 5: Physical Device Testing (60 min)

1. Connect iPhone via USB
2. In Xcode: Select your iPhone from device dropdown
3. Run app (▶️ button)
4. Login as parent → Allow notifications
5. Login as kid (different device) → Log prayer
6. Parent should receive notification! 🎉

**✅ Push notifications working!**

---

## 🎉 Success Indicators

You'll know it's working when you see:

- ✅ Settings tab shows: "Notifications Enabled ✓"
- ✅ Xcode console: "✅ Push registration success, token: ..."
- ✅ Notification appears on iPhone within 1-2 seconds
- ✅ Tapping notification opens Prayer Approvals page
- ✅ Supabase logs: "✅ Push notification sent successfully"

---

## 🆘 Common Issues

### "No permission prompt"
→ Using simulator? Must use physical iPhone

### "Permission denied"
→ iPhone Settings → FGS Parent → Notifications → Enable

### "Token not saving"
→ Check GoogleService-Info.plist is in Xcode project

### "Notification not received"
→ Verify FCM_SERVER_KEY in Supabase environment variables

### "FCM error in logs"
→ Check APNs key uploaded to Firebase Cloud Messaging

---

## 📋 Verification

Before marking complete, verify:

- [ ] Physical iPhone required (simulator doesn't work)
- [ ] Firebase project created
- [ ] FCM_SERVER_KEY in Supabase
- [ ] APNs key uploaded to Firebase
- [ ] GoogleService-Info.plist in Xcode
- [ ] Push capability enabled
- [ ] App tested on device
- [ ] Notification received
- [ ] Notification tap navigation works

---

## ⏭️ After Setup

Once working:

1. Test all 4 notification types:
   - Prayer approval
   - Reward redemption
   - Join request
   - Milestone achievement

2. Optional: Repeat for Kids app
   - Bundle ID: `com.fgs.kids`
   - Separate GoogleService-Info.plist

3. Deploy to TestFlight for beta testing

---

## 📚 Need More Detail?

See `PUSH_NOTIFICATIONS_SETUP.md` for comprehensive guide with troubleshooting.

---

**Ready to start? Begin with Step 1! 🚀**
