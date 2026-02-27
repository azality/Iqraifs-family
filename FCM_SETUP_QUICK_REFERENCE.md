# 🚀 FCM Setup - Ultra Quick Reference Card

**Print this page and follow the steps!**

---

## ⏱️ TOTAL TIME: 2-4 Hours

---

## 📝 STEP 1: FIREBASE (15 min)

### 1.1 Create Project
- Go to: https://console.firebase.google.com/
- Click: "Add project"
- Name: `FGS-Production`
- Create

### 1.2 Add iOS App
- Click: iOS icon
- Bundle ID: `com.fgs.parent`
- Register

### 1.3 Download Files
- Download: `GoogleService-Info.plist` ⬇️
- Save to Desktop

### 1.4 Get Server Key
- Project Settings → Cloud Messaging
- Copy: **Server key** (starts with `AAAA`)
- Paste in note app

✅ **CHECKPOINT:** You have .plist file and server key

---

## 📝 STEP 2: SUPABASE (2 min)

### 2.1 Add Environment Variable
- Go to: https://supabase.com/dashboard
- Select: Your FGS project
- Edge Functions → Manage secrets
- Add secret:
  - Name: `FCM_SERVER_KEY`
  - Value: [paste server key from Step 1.4]
- Save

✅ **CHECKPOINT:** FCM_SERVER_KEY added to Supabase

---

## 📝 STEP 3: APPLE DEVELOPER (60 min)

### 3.1 Create App ID
- Go to: https://developer.apple.com/account/
- Certificates, Identifiers & Profiles
- Identifiers → + button
- Type: App IDs
- Bundle ID: `com.fgs.parent`
- Capabilities: ✓ Push Notifications
- Register

### 3.2 Create APNs Key
- Keys → + button
- Name: `FGS Push Key`
- Service: ✓ APNs
- Continue → Register
- **Download `.p8` file** ⬇️
- **Save Key ID** (10 characters)
- **Save Team ID** (top right corner)

### 3.3 Upload to Firebase
- Back to Firebase Console
- Project Settings → Cloud Messaging
- iOS app configuration
- Upload APNs Authentication Key
  - Upload: .p8 file
  - Key ID: [from 3.2]
  - Team ID: [from 3.2]
- Upload

✅ **CHECKPOINT:** APNs key uploaded to Firebase

---

## 📝 STEP 4: XCODE (15 min)

### 4.1 Build iOS App
```bash
npm run cap:sync:parent
npm run cap:open:ios
```

### 4.2 Add Google Service File
- Locate: `GoogleService-Info.plist` from Desktop
- Drag into Xcode: `App` folder (next to Info.plist)
- ✓ Copy items if needed
- ✓ Add to targets: App
- Finish

### 4.3 Enable Capabilities
- Select project → App target
- Signing & Capabilities tab
- + Capability → Push Notifications
- + Capability → Background Modes
  - ✓ Remote notifications

### 4.4 Rebuild
```bash
npm run cap:sync:parent
```

✅ **CHECKPOINT:** Xcode configured

---

## 📝 STEP 5: TEST (60 min)

### 5.1 Run on iPhone
- Connect iPhone via USB
- Select iPhone in Xcode
- Click ▶️ Play button
- Trust developer on iPhone if needed

### 5.2 Verify Registration
- App launches
- Login as parent
- Check Settings tab: "🔔 Notifications Enabled ✓"

### 5.3 Test Notification
- On different device: Login as kid
- Log a prayer (Fajr)
- Parent iPhone: Should receive notification!

✅ **CHECKPOINT:** Notifications working!

---

## 🎉 SUCCESS CHECKLIST

- [ ] Firebase project created
- [ ] GoogleService-Info.plist downloaded
- [ ] FCM server key copied
- [ ] FCM_SERVER_KEY in Supabase environment
- [ ] App ID created (com.fgs.parent)
- [ ] APNs key (.p8) downloaded
- [ ] APNs key uploaded to Firebase
- [ ] GoogleService-Info.plist in Xcode
- [ ] Push Notifications capability enabled
- [ ] Background Modes enabled
- [ ] App runs on physical iPhone
- [ ] Settings shows "Notifications Enabled ✓"
- [ ] Test notification received

**All checked?** ✅ Push notifications COMPLETE!

---

## 🆘 QUICK TROUBLESHOOTING

| Problem | Fix |
|---------|-----|
| No permission prompt | Must use physical iPhone (not simulator) |
| "Notifications Disabled ✗" | Check GoogleService-Info.plist in Xcode |
| Notification not received | Verify FCM_SERVER_KEY in Supabase |
| FCM error in logs | Check APNs key uploaded to Firebase |
| Wrong Bundle ID error | Must be exactly `com.fgs.parent` |

---

## 📞 NEED HELP?

See detailed guide: `PUSH_NOTIFICATIONS_SETUP.md`

---

**Print this page, check off each step, and you're done! 🚀**
