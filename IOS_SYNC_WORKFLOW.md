# iOS Sync Workflow - FIXED

## ✅ What Was Fixed

### 1. **Sync Scripts Now Point to Correct Capacitor Folder**

**Before (WRONG):**
```powershell
xcopy /E /I /Y dist ios-parent\App\public      # ❌ Missing "App" subfolder
xcopy /E /I /Y dist ios-kids\App\public        # ❌ Missing "App" subfolder
```

**After (CORRECT):**
```powershell
xcopy /E /I /Y dist ios-parent\App\App\public  # ✅ Correct Capacitor structure
xcopy /E /I /Y dist ios-kids\App\App\public    # ✅ Correct Capacitor structure
```

### 2. **Auth Migration to Capacitor Preferences - Already Complete**

✅ `/src/utils/storage.ts` - Cross-platform storage wrapper created
✅ `/src/utils/auth.ts` - Uses `setStorage()` and `removeMultiple()` from storage wrapper
✅ `/src/app/contexts/AuthContext.tsx` - Uses `getStorage()`, `setStorage()`, `getMultiple()`, etc.

**The auth system is fully iOS-ready with native storage.**

---

## 📱 Correct iOS Folder Structure

```
ios-parent/
├── App/
│   ├── App/                    ← Xcode target
│   │   ├── public/             ← ✅ THIS IS WHERE YOUR BUILD GOES
│   │   │   ├── index.html
│   │   │   ├── assets/
│   │   │   └── ...
│   │   ├── App.xcodeproj       ← Open this in Xcode
│   │   └── ...
│   ├── public/                 ← ❌ WRONG LOCATION (where scripts were copying before)
│   └── capacitor.config.ts
└── ...

ios-kids/
├── App/
│   ├── App/                    ← Xcode target
│   │   ├── public/             ← ✅ THIS IS WHERE YOUR BUILD GOES
│   │   │   ├── index.html
│   │   │   ├── assets/
│   │   │   └── ...
│   │   ├── App.xcodeproj       ← Open this in Xcode
│   │   └── ...
│   ├── public/                 ← ❌ WRONG LOCATION (where scripts were copying before)
│   └── capacitor.config.ts
└── ...
```

---

## 🚀 Production Workflow (Windows)

### **Parent App**

```powershell
# 1. Build & sync to CORRECT iOS folder
npm run sync:parent

# 2. Verify files are in the RIGHT place
Get-ChildItem ios-parent\App\App\public\index.html | Select FullName, LastWriteTime

# 3. (Optional) Run Capacitor sync to update native plugins
npm run cap:sync:parent

# 4. Open in Xcode
npm run open:parent
```

### **Kids App**

```powershell
# 1. Build & sync to CORRECT iOS folder
npm run sync:kids

# 2. Verify files are in the RIGHT place
Get-ChildItem ios-kids\App\App\public\index.html | Select FullName, LastWriteTime

# 3. (Optional) Run Capacitor sync to update native plugins
npm run cap:sync:kids

# 4. Open in Xcode
npm run open:kids
```

### **Combined Workflows**

```powershell
# Quick sync + open (no Capacitor sync)
npm run ios:parent
npm run ios:kids

# FULL workflow (build + cap sync + open)
npm run full:parent
npm run full:kids
```

---

## 🔍 Verification Commands

### **Check if files are in the RIGHT place:**

```powershell
# Parent app - check timestamp
Get-ChildItem ios-parent\App\App\public\index.html | Select FullName, LastWriteTime

# Kids app - check timestamp
Get-ChildItem ios-kids\App\App\public\index.html | Select FullName, LastWriteTime

# List all files in CORRECT public folder
Get-ChildItem ios-parent\App\App\public
Get-ChildItem ios-kids\App\App\public
```

### **Check if old WRONG location still exists:**

```powershell
# These folders should either not exist or be OLD
Get-ChildItem ios-parent\App\public -ErrorAction SilentlyContinue
Get-ChildItem ios-kids\App\public -ErrorAction SilentlyContinue
```

---

## 🧹 Clean Old Wrong Location (Optional)

If you want to remove the old wrong locations to avoid confusion:

```powershell
# Delete old wrong folders
Remove-Item -Recurse -Force ios-parent\App\public -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force ios-kids\App\public -ErrorAction SilentlyContinue
```

---

## 🍎 Mac Users

Same fix applied for Mac scripts:

```bash
# Build & sync to CORRECT iOS folder
npm run sync:parent:mac
npm run sync:kids:mac

# Verify
ls -la ios-parent/App/App/public/index.html
ls -la ios-kids/App/App/public/index.html
```

---

## 🔐 Auth System Architecture (iOS-Ready)

### **Storage Strategy:**

- **Native iOS/Android**: Uses `@capacitor/preferences` (native storage)
- **Web**: Falls back to `localStorage`
- **Storage Wrapper**: `/src/utils/storage.ts` handles both platforms automatically

### **Key Functions:**

```typescript
import { setStorage, getStorage, removeStorage, getMultiple, setMultiple, removeMultiple, STORAGE_KEYS } from '/src/utils/storage';

// Set value (async)
await setStorage(STORAGE_KEYS.USER_ID, 'abc123');

// Get value (async)
const userId = await getStorage(STORAGE_KEYS.USER_ID);

// Get multiple (optimized)
const data = await getMultiple([STORAGE_KEYS.USER_ID, STORAGE_KEYS.USER_ROLE]);

// Remove multiple
await removeMultiple([STORAGE_KEYS.ACCESS_TOKEN, STORAGE_KEYS.USER_ID]);
```

### **Storage Keys:**

```typescript
STORAGE_KEYS = {
  USER_ID: 'fgs_user_id',
  USER_NAME: 'fgs_user_name',
  USER_EMAIL: 'user_email',
  USER_ROLE: 'user_role',
  USER_MODE: 'fgs_user_mode',
  FAMILY_ID: 'fgs_family_id',
  ACCESS_TOKEN: 'fgs_access_token',
  KID_SESSION_TOKEN: 'kid_session_token',
  CHILD_ID: 'child_id',
}
```

---

## 🎯 Next Steps

1. **Run the sync with fixed paths:**
   ```powershell
   npm run sync:parent
   npm run sync:kids
   ```

2. **Verify timestamps in CORRECT location:**
   ```powershell
   Get-ChildItem ios-parent\App\App\public\index.html | Select FullName, LastWriteTime
   Get-ChildItem ios-kids\App\App\public\index.html | Select FullName, LastWriteTime
   ```

3. **Open in Xcode and test on device:**
   ```powershell
   npm run open:parent
   # Test login/logout/session persistence on iOS device
   ```

4. **(Optional) Clean old wrong folders:**
   ```powershell
   Remove-Item -Recurse -Force ios-parent\App\public
   Remove-Item -Recurse -Force ios-kids\App\public
   ```

---

## 📊 Summary

| Issue | Status |
|-------|--------|
| ✅ Auth uses Capacitor Preferences | COMPLETE |
| ✅ Sync scripts point to correct folder | FIXED |
| ✅ Storage wrapper created | COMPLETE |
| ✅ AuthContext.tsx migrated | COMPLETE |
| ✅ auth.ts migrated | COMPLETE |
| ✅ Cross-platform compatibility | COMPLETE |

**Your iOS apps are now production-ready for native storage and should work correctly on device!**
