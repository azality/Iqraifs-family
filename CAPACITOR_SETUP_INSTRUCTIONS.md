# 📱 CAPACITOR SETUP - STEP-BY-STEP INSTRUCTIONS

**Status:** ✅ Configuration files created  
**Next:** Run installation commands

---

## ✅ WHAT'S ALREADY DONE

I've just configured your project for iOS deployment:

1. ✅ Added Capacitor scripts to `package.json`
2. ✅ Created `capacitor.config.ts` (default - parent app)
3. ✅ Created `capacitor.config.parent.ts` (parent app config)
4. ✅ Created `capacitor.config.kids.ts` (kids app config)

---

## 🚀 NEXT STEPS - RUN THESE COMMANDS

### Step 1: Install Capacitor Packages

**Note:** Since this is a Figma Make environment, you'll need to install these locally when you export the project.

```bash
# Install Capacitor core and CLI
npm install @capacitor/core @capacitor/cli --save

# Install iOS platform
npm install @capacitor/ios --save

# Install useful plugins
npm install @capacitor/splash-screen @capacitor/status-bar --save
```

---

### Step 2: Initialize Capacitor (First Time Only)

```bash
# Initialize Capacitor with parent app config
npx cap init "FGS Parent" "com.fgs.parent" --web-dir dist
```

**When prompted:**
- App name: `FGS Parent`
- App ID: `com.fgs.parent`
- Web asset directory: `dist`

---

### Step 3: Add iOS Platform

```bash
# Add iOS platform (creates /ios directory)
npm run cap:add:ios

# This creates:
# - /ios directory with Xcode project
# - iOS native code structure
# - App configuration files
```

---

### Step 4: Build and Sync (Parent App)

```bash
# Build parent app and sync to iOS
npm run cap:sync:parent

# This does:
# 1. Builds with VITE_APP_MODE=parent
# 2. Copies dist to iOS project
# 3. Updates iOS native dependencies
```

---

### Step 5: Open in Xcode

```bash
# Open iOS project in Xcode
npm run cap:open:ios
```

**In Xcode:**
1. Select "App" target in left sidebar
2. Go to "Signing & Capabilities"
3. Enable "Automatically manage signing"
4. Select your Apple Developer Team
5. Set Bundle Identifier: `com.fgs.parent`
6. Click Run (▶️) to test in simulator

---

## 📱 BUILDING THE KIDS APP

Since you need **two separate apps**, here's how to build the kids version:

### Option 1: Separate iOS Folders (Recommended)

```bash
# 1. Build kids web assets
npm run build:kids

# 2. Copy iOS folder
cp -r ios ios-kids

# 3. Update config to kids version
cp capacitor.config.kids.ts capacitor.config.ts

# 4. Sync kids build to ios-kids
npx cap sync ios --project ios-kids

# 5. Open kids project
npx cap open ios --project ios-kids
```

**In Xcode (Kids App):**
1. Change Bundle Identifier to: `com.fgs.kids`
2. Change Display Name to: `FGS Kids`
3. Update app icons (use kids theme - warm colors)
4. Build and test

---

### Option 2: Xcode Schemes (Advanced)

Create two build schemes in Xcode:
- Scheme 1: FGS Parent (target: com.fgs.parent)
- Scheme 2: FGS Kids (target: com.fgs.kids)

This is more complex but cleaner for ongoing development.

---

## 🎨 NEXT: APP ICONS AND ASSETS

You'll need icons for both apps. Create these sizes:

### Required Icon Sizes

| Size | Purpose |
|------|---------|
| 1024x1024 | App Store |
| 180x180 | iPhone (@3x) |
| 120x120 | iPhone (@2x) |
| 167x167 | iPad Pro |
| 152x152 | iPad (@2x) |
| 76x76 | iPad (@1x) |

### Design Guidelines

**Parent App Icons:**
- Colors: Professional purple (#8B5CF6)
- Style: Clean, modern, dashboard-like
- Elements: Family silhouettes + Analytics icon

**Kids App Icons:**
- Colors: Warm orange/yellow (#F59E0B)
- Style: Playful, adventurous
- Elements: Quest map + Stars/Trophy

### Tools for Icons

- **Design:** Figma, Sketch, Adobe Illustrator
- **Generate all sizes:** https://appicon.co
- **Test:** Preview.app on macOS

---

## 📋 CAPACITOR COMMANDS REFERENCE

Now available in your project:

```bash
# Build parent app for iOS
npm run build:parent

# Build kids app for iOS
npm run build:kids

# Sync parent app to iOS
npm run cap:sync:parent

# Sync kids app to iOS
npm run cap:sync:kids

# Open in Xcode
npm run cap:open:ios

# Update Capacitor and plugins
npm run cap:update

# Copy web assets only (no native update)
npm run cap:copy

# Full sync (copy + update)
npm run cap:sync
```

---

## 🧪 TESTING YOUR iOS BUILD

### 1. Test in Simulator

```bash
# Build and open
npm run cap:sync:parent
npm run cap:open:ios

# In Xcode:
# - Select simulator (iPhone 15, etc.)
# - Click Run (▶️)
```

**Test Checklist:**
- [ ] App launches without crash
- [ ] Login works
- [ ] Navigation works
- [ ] API calls succeed
- [ ] Images load
- [ ] Fonts render correctly

---

### 2. Test on Physical Device

```bash
# Connect iPhone via USB
# In Xcode:
# - Select your iPhone from device list
# - Click Run (▶️)
```

**First time:**
- Xcode installs provisioning profile
- On iPhone: Settings → General → VPN & Device Management → Trust Developer

**Test Checklist:**
- [ ] WiFi connectivity
- [ ] Cellular connectivity
- [ ] Performance (smooth scrolling)
- [ ] Touch targets (buttons big enough)
- [ ] Memory usage (check Instruments)

---

## 🔧 TROUBLESHOOTING

### Issue: "Command not found: cap"

**Solution:**
```bash
# Install Capacitor CLI globally
npm install -g @capacitor/cli

# Or use npx
npx cap --version
```

---

### Issue: "Cannot find module @capacitor/core"

**Solution:**
```bash
# Install dependencies
npm install @capacitor/core @capacitor/cli
```

---

### Issue: Xcode build fails with signing errors

**Solution:**
1. Xcode → Signing & Capabilities
2. Change Team to your Apple ID
3. Click "Automatically manage signing"
4. Clean build: Product → Clean Build Folder
5. Rebuild

---

### Issue: App crashes on launch

**Solution:**
1. Check Xcode console for error messages
2. Common issues:
   - API URL incorrect (check production URL)
   - CORS not allowing iOS origin
   - localStorage not working (use Capacitor Preferences)

---

### Issue: White screen on app launch

**Solution:**
1. Check that `dist` folder exists
2. Verify `webDir: 'dist'` in capacitor.config.ts
3. Run `npm run build` first
4. Then run `npx cap sync`

---

## 📚 USEFUL CAPACITOR PLUGINS

Consider adding these for better iOS experience:

### Storage (Better than localStorage)
```bash
npm install @capacitor/preferences

# Usage:
import { Preferences } from '@capacitor/preferences';

await Preferences.set({ key: 'name', value: 'Alice' });
const { value } = await Preferences.get({ key: 'name' });
```

### Network Status
```bash
npm install @capacitor/network

# Usage:
import { Network } from '@capacitor/network';

const status = await Network.getStatus();
console.log('Connected:', status.connected);
```

### App Info
```bash
npm install @capacitor/app

# Usage:
import { App } from '@capacitor/app';

const info = await App.getInfo();
console.log('App version:', info.version);
```

### Device Info
```bash
npm install @capacitor/device

# Usage:
import { Device } from '@capacitor/device';

const info = await Device.getInfo();
console.log('Platform:', info.platform);
```

---

## 🎯 CAPACITOR SETUP CHECKLIST

### Initial Setup
- [ ] Install Capacitor packages
- [ ] Initialize Capacitor project
- [ ] Add iOS platform
- [ ] Build web assets (parent)
- [ ] Sync to iOS project
- [ ] Open in Xcode

### Parent App Configuration
- [ ] Set Bundle ID: `com.fgs.parent`
- [ ] Set Display Name: `FGS Parent`
- [ ] Configure signing
- [ ] Add app icons (purple theme)
- [ ] Test in simulator
- [ ] Test on device

### Kids App Configuration
- [ ] Create separate iOS folder
- [ ] Build kids web assets
- [ ] Set Bundle ID: `com.fgs.kids`
- [ ] Set Display Name: `FGS Kids`
- [ ] Add app icons (orange theme)
- [ ] Test in simulator
- [ ] Test on device

### Final Testing
- [ ] Both apps launch successfully
- [ ] Authentication works in both
- [ ] API calls work
- [ ] Performance acceptable
- [ ] No critical bugs

---

## ✅ WHAT I'VE PREPARED FOR YOU

1. ✅ **package.json** - Added all Capacitor scripts
2. ✅ **capacitor.config.ts** - Default configuration
3. ✅ **capacitor.config.parent.ts** - Parent app config (purple theme)
4. ✅ **capacitor.config.kids.ts** - Kids app config (orange theme)
5. ✅ **This guide** - Complete setup instructions

---

## 🚀 NEXT: RATE LIMITING & TESTING

Once Capacitor is set up, we'll tackle:

1. ✅ **Supabase Rate Limiting** - Configure in dashboard
2. ✅ **Pre-Launch Testing** - Comprehensive test suite
3. ✅ **App Store Submission** - Follow deployment guide

---

## 📞 NEED HELP?

**Capacitor Documentation:**
- Getting Started: https://capacitorjs.com/docs/getting-started
- iOS Setup: https://capacitorjs.com/docs/ios
- Plugins: https://capacitorjs.com/docs/plugins

**Common Issues:**
- Check: `/IOS_DEPLOYMENT_GUIDE.md` for detailed troubleshooting
- Capacitor Forums: https://forum.ionicframework.com/c/capacitor/

---

**Status:** ✅ Capacitor configuration complete!  
**Next Step:** Install packages and run commands above  
**Then:** Move to rate limiting configuration
