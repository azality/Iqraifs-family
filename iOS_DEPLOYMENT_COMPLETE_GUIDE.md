# 📱 iOS DEPLOYMENT - COMPLETE GUIDE
**Family Growth System - Dual App Deployment**

You have **TWO iOS apps** to deploy:
1. **FGS Parent** - For parents (in `ios-parent/` folder)
2. **FGS Kids** - For children (in `ios-kids/` folder)

---

## 🎯 PREREQUISITES

### ✅ What You Have:
- [x] Apple Developer Account ($99/year paid)
- [x] Mac computer
- [x] Project code with Capacitor configured

### 📥 What You Need to Install on Mac:

#### 1. **Xcode** (Required)
```bash
# Install from Mac App Store
# Search for "Xcode" and install (it's free but large ~15GB)
# After install, open Xcode once to accept license
```

#### 2. **Xcode Command Line Tools**
```bash
xcode-select --install
```

#### 3. **Node.js & npm** (if not installed)
```bash
# Download from: https://nodejs.org/
# Choose LTS version
# Or use Homebrew:
brew install node
```

#### 4. **Capacitor CLI**
```bash
npm install -g @capacitor/cli
```

#### 5. **CocoaPods** (iOS dependency manager)
```bash
sudo gem install cocoapods
```

---

## 🔧 INITIAL SETUP (ONE-TIME)

### Step 1: Transfer Project to Mac

```bash
# Option A: Clone from GitHub (if you already pushed)
git clone https://github.com/yourusername/fgs-app.git
cd fgs-app

# Option B: Copy zip file to Mac and extract
# Then navigate to the folder
cd /path/to/fgs-app

# Install dependencies
npm install
```

### Step 2: Verify Capacitor Setup

```bash
# Check Capacitor is configured
npx cap doctor

# You should see both iOS projects listed
```

---

## 🍎 APPLE DEVELOPER PORTAL SETUP

### Create App IDs (One-Time Setup)

1. **Go to:** https://developer.apple.com/account/
2. **Navigate to:** Certificates, Identifiers & Profiles → Identifiers
3. **Create TWO App IDs:**

#### App ID #1: FGS Parent
```
Description: FGS Parent
Bundle ID: com.yourcompany.fgs.parent
Capabilities:
  ✅ Push Notifications
  ✅ Associated Domains (optional)
```

#### App ID #2: FGS Kids
```
Description: FGS Kids  
Bundle ID: com.yourcompany.fgs.kids
Capabilities:
  ✅ Push Notifications
  ✅ Associated Domains (optional)
```

4. **Click:** Continue → Register

---

## 🔐 CERTIFICATES & PROVISIONING PROFILES

### Option A: Automatic (Recommended for First Time)

Xcode can handle this automatically:
1. Open Xcode
2. Go to Preferences → Accounts
3. Add your Apple Developer account
4. Xcode will auto-create certificates when you build

### Option B: Manual (Advanced)

If you need manual control:
1. **Create Development Certificate**
   - Certificates, Identifiers & Profiles → Certificates
   - Click + → iOS App Development
   - Follow prompts

2. **Create Provisioning Profiles**
   - Profiles → Click +
   - Development → iOS App Development
   - Select your App ID
   - Select your certificate
   - Select your test devices
   - Name it and download

---

## 🚀 DEPLOY PARENT APP

### Step 1: Update Bundle ID in Xcode

```bash
# Build the Parent app
npm run build:parent

# Sync to iOS
cd ios-parent
npx cap sync ios

# Open in Xcode
npx cap open ios
```

### Step 2: Configure in Xcode

Xcode will open. Now:

1. **Select Project** (top left, blue icon)
2. **Select Target:** "App" 
3. **General Tab:**
   ```
   Display Name: FGS Parent
   Bundle Identifier: com.yourcompany.fgs.parent
   Version: 1.0
   Build: 1
   ```

4. **Signing & Capabilities Tab:**
   ```
   Team: Select your Apple Developer Team
   ✅ Automatically manage signing (enable this)
   ```

5. **Info Tab:**
   - Verify your app settings look correct

### Step 3: Connect Your iPhone

1. **Connect iPhone to Mac** via USB
2. **Trust Computer** on iPhone when prompted
3. **In Xcode:** Select your iPhone from device dropdown (top bar)

### Step 4: Build & Run

1. **Click Play button** (▶) in Xcode toolbar
2. **First time:** May take 5-10 minutes to build
3. **iPhone will show:** "Untrusted Developer" message

### Step 5: Trust Developer on iPhone

1. **iPhone:** Settings → General → VPN & Device Management
2. **Find:** Your Apple Developer Account
3. **Tap:** Trust
4. **Confirm:** Trust

### Step 6: Launch App!

- App should now launch on your iPhone
- Test parent login flow
- Verify it connects to your Supabase backend

---

## 👶 DEPLOY KIDS APP

Same process, but for Kids app:

### Step 1: Build Kids App

```bash
# Return to project root
cd ..

# Build the Kids app
npm run build:kids

# Sync to iOS
cd ios-kids
npx cap sync ios

# Open in Xcode
npx cap open ios
```

### Step 2: Configure in Xcode

1. **Select Project** (top left, blue icon)
2. **Select Target:** "App"
3. **General Tab:**
   ```
   Display Name: FGS Kids
   Bundle Identifier: com.yourcompany.fgs.kids
   Version: 1.0
   Build: 1
   ```

4. **Signing & Capabilities Tab:**
   ```
   Team: Select your Apple Developer Team
   ✅ Automatically manage signing
   ```

### Step 3: Build & Run

1. **Select your iPhone** from device dropdown
2. **Click Play button** (▶)
3. **Trust developer** on iPhone (same as before)
4. **Launch app!**

Now you have BOTH apps on your iPhone! 🎉

---

## 🎨 CUSTOMIZE APP ICONS & SPLASH SCREENS

### Parent App Icons

1. **Prepare Images:**
   - 1024x1024px PNG (App Store icon)
   - Use an icon design tool or hire a designer

2. **Add to Xcode:**
   ```
   ios-parent/App/App/Assets.xcassets/AppIcon.appiconset/
   ```

3. **Drag & Drop** your icons into Xcode's asset catalog

### Kids App Icons

Same process for `ios-kids/App/App/Assets.xcassets/`

### Splash Screens

Located at:
```
ios-parent/App/App/Assets.xcassets/Splash.imageset/
ios-kids/App/App/Assets.xcassets/Splash.imageset/
```

---

## 📤 TESTFLIGHT DEPLOYMENT (BETA TESTING)

### Step 1: Archive the App

**In Xcode:**
1. **Select:** "Any iOS Device (arm64)" from device dropdown
2. **Menu:** Product → Archive
3. **Wait:** 5-10 minutes for archive to complete
4. **Organizer window** will open

### Step 2: Distribute to TestFlight

**In Organizer:**
1. **Select** your archive
2. **Click:** Distribute App
3. **Choose:** App Store Connect
4. **Click:** Upload
5. **Accept** defaults and continue
6. **Wait** for upload (5-10 minutes)

### Step 3: Configure in App Store Connect

1. **Go to:** https://appstoreconnect.apple.com/
2. **My Apps** → Click + → New App
3. **Fill in details:**
   ```
   Platform: iOS
   Name: FGS Parent (or FGS Kids)
   Primary Language: English
   Bundle ID: com.yourcompany.fgs.parent
   SKU: fgs-parent-001
   ```

4. **TestFlight Tab:**
   - Add yourself as internal tester
   - Add external testers (up to 10,000 users)

5. **Build will appear** in 10-30 minutes after processing

### Step 4: Test via TestFlight

1. **Install TestFlight** on iPhone (from App Store)
2. **Accept invitation** email from Apple
3. **Install your app** from TestFlight
4. **Test everything!**

### Step 5: Repeat for Kids App

Same process for the Kids app.

---

## 🏪 APP STORE SUBMISSION (PRODUCTION)

### Required Assets:

1. **App Screenshots**
   - 6.7" display (iPhone 14 Pro Max): 1290 x 2796 px
   - 6.5" display (iPhone 11 Pro Max): 1242 x 2688 px
   - 5.5" display (iPhone 8 Plus): 1242 x 2208 px
   - Take screenshots of key features

2. **App Preview Videos** (Optional)
   - 15-30 second video showing app features

3. **Description & Keywords**
   - Parent App: Focus on family management, behavioral tracking
   - Kids App: Focus on adventure, learning, Islamic education

4. **Privacy Policy**
   - Required! Create a webpage with your privacy policy
   - Must be publicly accessible URL

5. **Support URL**
   - Your support/contact page

### Submission Process:

**In App Store Connect:**

1. **Navigate to:** App Information
2. **Fill in:**
   - Category: Education or Lifestyle
   - Subcategory: Family
   - Content Rights: Check if you have rights
   
3. **Pricing & Availability:**
   - Free or Paid (your choice)
   - Select countries

4. **App Privacy:**
   - Fill in data collection questionnaire
   - Be honest about what data you collect

5. **Prepare for Submission:**
   - Upload screenshots
   - Write description (4,000 character limit)
   - Add keywords
   - Set content rating (4+)
   - Add privacy policy URL

6. **Submit for Review**
   - Click "Submit for Review"
   - Wait 24-48 hours for Apple review
   - Respond to any rejection feedback

---

## 🔔 PUSH NOTIFICATIONS SETUP

### APNs (Apple Push Notification Service)

1. **Create APNs Key:**
   - Apple Developer Portal → Keys
   - Click + → Apple Push Notifications service (APNs)
   - Name it: "FGS APNs Key"
   - Download the `.p8` file (SAVE IT SECURELY!)
   - Note the Key ID

2. **Upload to Firebase Console:**
   - Firebase Console → Project Settings → Cloud Messaging
   - iOS app configuration → APNs Authentication Key
   - Upload your `.p8` file
   - Enter Key ID and Team ID

3. **Add Push Capabilities in Xcode:**
   - Target → Signing & Capabilities
   - Click + Capability
   - Add "Push Notifications"
   - Do this for BOTH apps

4. **Test Push Notifications:**
   ```bash
   # From your parent app, log a prayer
   # You should receive a notification on parent device
   ```

---

## 🔧 TROUBLESHOOTING

### "Failed to create provisioning profile"
**Fix:** 
1. Xcode → Preferences → Accounts
2. Download Manual Profiles
3. Try building again

### "Code signing issue"
**Fix:**
1. Clean build folder: Product → Clean Build Folder
2. Quit Xcode
3. Delete `~/Library/Developer/Xcode/DerivedData`
4. Reopen Xcode and rebuild

### "Pod install failed"
**Fix:**
```bash
cd ios-parent/App  # or ios-kids/App
pod install --repo-update
```

### "App doesn't connect to backend"
**Fix:**
1. Check Supabase URL is correct in `utils/supabase/info.tsx`
2. Verify Supabase Edge Functions are running
3. Check network permissions in Info.plist

### "Build takes forever"
**First build:** 10-15 minutes is normal
**Subsequent builds:** 2-3 minutes

---

## 📋 DAILY DEVELOPMENT WORKFLOW

After initial setup, your daily workflow is simple:

```bash
# Make code changes in your editor

# For Parent App:
npm run full:parent
# Opens Xcode, click Play to test

# For Kids App:
npm run full:kids  
# Opens Xcode, click Play to test
```

---

## 🎯 CHECKLIST: PRE-SUBMISSION

Before submitting to App Store:

**Both Apps:**
- [ ] App icons added (1024x1024)
- [ ] Splash screens customized
- [ ] Bundle IDs are unique
- [ ] Version numbers set (1.0)
- [ ] Signing certificates configured
- [ ] Push notifications working
- [ ] App connects to production Supabase
- [ ] All features tested on real device
- [ ] Screenshots captured (all sizes)
- [ ] Privacy policy created and published
- [ ] Support URL working

**App Store Connect:**
- [ ] Apps created in App Store Connect
- [ ] Descriptions written
- [ ] Keywords added
- [ ] Pricing set
- [ ] App privacy questionnaire completed
- [ ] Age rating appropriate (4+)
- [ ] Review notes added (if needed)

---

## 💰 COSTS SUMMARY

- ✅ **Apple Developer Program:** $99/year (you already have this)
- ✅ **Mac & Xcode:** Free
- ✅ **TestFlight:** Free (included with developer account)
- ✅ **App Store Submission:** Free (unlimited submissions)

**Total Additional Cost:** $0 🎉

---

## 🆘 COMMON QUESTIONS

### Q: Can I test on iOS Simulator?
**A:** Yes! Select "iPhone 14 Pro" (or any simulator) instead of real device. But push notifications WON'T work in simulator.

### Q: How many devices can I test on?
**A:** Up to 100 devices per year with your developer account.

### Q: Can I update the app after it's live?
**A:** Yes! Just increment version number (1.0 → 1.1), rebuild, and resubmit.

### Q: What if Apple rejects my app?
**A:** Common reasons:
1. Missing privacy policy
2. App crashes on review
3. Incomplete metadata

Fix the issue and resubmit. Usually takes 24-48 hours.

### Q: Do I need a Mac for updates?
**A:** Yes, you need a Mac for ALL iOS development and submissions.

---

## 🎉 SUCCESS!

Once you complete these steps, you'll have:

✅ **Web App** live on Netlify  
✅ **FGS Parent** app on your iPhone  
✅ **FGS Kids** app on your iPhone  
✅ Both apps in TestFlight for beta testing  
✅ Both apps ready for App Store submission  

---

## 📞 NEXT STEPS

1. **Week 1:** Deploy web app, test thoroughly
2. **Week 2:** Deploy iOS apps to your device, test intensively
3. **Week 3:** TestFlight beta with family/friends
4. **Week 4:** Submit to App Store

**Timeline to App Store:** 2-4 weeks from start to approval

---

**Need help?** Check these files:
- `/DEPLOYMENT_READINESS_REPORT.md` - Full system audit
- `/NETLIFY_DEPLOY_NOW.md` - Web deployment guide
- `/iOS_DEPLOYMENT_COMPLETE_GUIDE.md` - This file

**You've got this!** 🚀 Your Muslim families app is about to go live!
