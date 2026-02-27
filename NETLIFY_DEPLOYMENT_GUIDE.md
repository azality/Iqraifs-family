# 🚀 Netlify Deployment & Troubleshooting Guide

**Date:** February 19, 2026  
**Issue:** Kid login not working after Netlify deployment

---

## 🔍 DIAGNOSIS

### The Problem

When you deploy the FGS app to Netlify:
- **Frontend** is hosted on Netlify (e.g., `your-app.netlify.app`)
- **Backend** is still on Supabase Edge Functions
- **Kid login requires** a parent to have logged in first to set the `fgs_family_id` in localStorage

### Why Kid Login Fails

Kid login follows this flow:
1. Kid goes to `/kid-login`
2. System reads `fgs_family_id` from localStorage
3. Fetches children for that family
4. Shows PIN entry screen

**If no parent has ever logged in on that device/browser:**
- ❌ No `fgs_family_id` in localStorage
- ❌ Kid login shows error: "No family found"
- ❌ Cannot proceed

---

## ✅ SOLUTION: FIRST-TIME SETUP

### Step 1: Parent Must Log In First

**Before kids can use the app, a parent MUST:**
1. Go to your Netlify URL (e.g., `your-app.netlify.app`)
2. Click "Parent Login"
3. Sign in with email + password
4. Complete onboarding if first time
5. This sets `fgs_family_id` in localStorage

**What happens behind the scenes:**
```javascript
// Parent login stores family ID
localStorage.setItem('fgs_family_id', 'abc-123-xyz');
```

### Step 2: Now Kids Can Log In

**After parent login:**
1. Parent can log out (family ID stays in localStorage!)
2. Kids can go to `/kid-login`
3. They'll see their profile pictures
4. Enter PIN to log in

---

## 🛠️ TROUBLESHOOTING

### Problem 1: "No family found" Error

**Symptoms:**
- Kid login shows: "No family found. Please ask a parent to log in first."
- No children appear

**Solution:**
1. Open browser console (F12)
2. Check localStorage: `localStorage.getItem('fgs_family_id')`
3. If `null`, a parent needs to log in first
4. **Go to `/system-diagnostics`** to see full diagnostic

**Quick Fix:**
```bash
# Navigate to:
https://your-app.netlify.app/parent-login

# Log in as parent
# Then log out
# Then try kid login again
```

---

### Problem 2: "Failed to load children" Error

**Symptoms:**
- Family ID exists, but children won't load
- Error in console about backend connection

**Diagnosis:**
1. Go to `/system-diagnostics`
2. Check "Supabase Backend Connection" test
3. Check "Load Children" test

**Possible Causes:**
- Backend is down (unlikely)
- Network/CORS issue
- Family ID is invalid (orphaned)

**Solution:**
1. Check console logs for exact error
2. Try parent login again to refresh family ID
3. Check Supabase Edge Functions are deployed

---

### Problem 3: Pin Verification Fails

**Symptoms:**
- Kid selects profile
- Enters correct PIN
- Shows "Incorrect PIN" or no response

**Diagnosis:**
```bash
# Check console logs
# Look for error from:
POST /children/:childId/verify-pin
```

**Possible Causes:**
- Backend route not working
- PIN not set correctly for child
- Network issue

**Solution:**
1. Parent logs in
2. Go to Settings → Children
3. Verify child has a PIN set
4. Try resetting PIN
5. Try kid login again

---

## 🔧 DIAGNOSTIC TOOLS

### Tool 1: System Diagnostics

**URL:** `https://your-app.netlify.app/system-diagnostics`

**What it checks:**
- ✅ Family ID in localStorage
- ✅ Supabase backend connection
- ✅ Can load children
- ✅ Environment configuration
- ✅ Current session status

**How to use:**
1. Navigate to `/system-diagnostics`
2. Wait for tests to run
3. Check results
4. Follow "Quick Fixes" suggestions

---

### Tool 2: Debug Storage

**URL:** `https://your-app.netlify.app/debug-storage`

**What it shows:**
- All localStorage keys and values
- Supabase session info
- Current user data

**How to use:**
1. Navigate to `/debug-storage`
2. Look for `fgs_family_id`
3. Check it has a value (UUID format)
4. If missing, parent needs to log in

---

### Tool 3: Browser Console

**How to open:**
- Chrome: F12 or Cmd+Option+I (Mac)
- Firefox: F12 or Cmd+Option+K (Mac)
- Edge: F12

**What to check:**
```javascript
// Check family ID
localStorage.getItem('fgs_family_id')
// Should return: "abc-123-xyz..." (UUID)

// Check all FGS keys
Object.keys(localStorage).filter(k => k.includes('fgs'))
// Should return: ["fgs_family_id", "fgs_user_id", ...]

// Check network errors
// Go to "Network" tab
// Try kid login
// Look for failed requests (red)
```

---

## 📋 DEPLOYMENT CHECKLIST

### First-Time Deployment to Netlify

**Before deploying:**
- [x] Supabase Edge Functions deployed
- [x] Environment variables set in Supabase
- [x] Backend health endpoint working

**After deploying to Netlify:**
1. [ ] Navigate to Netlify URL
2. [ ] Test parent login
3. [ ] Complete onboarding
4. [ ] Verify family ID in localStorage
5. [ ] Add at least one child
6. [ ] Set PIN for child
7. [ ] Log out
8. [ ] Test kid login
9. [ ] Verify kid can enter PIN
10. [ ] Verify kid dashboard loads

---

## 🔄 THE CORRECT LOGIN FLOW

### For First-Time Users

**Day 1: Parent Setup**
```
1. Parent 1 goes to app → /parent-login
2. Signs up → /signup
3. Completes onboarding → /onboarding
4. Creates family
5. Adds children
6. Sets PINs for children
7. ✅ fgs_family_id now in localStorage
```

**Day 1: Kid Can Now Log In**
```
1. Parent logs out
2. Kid goes to /kid-login
3. Sees their profile picture
4. Enters PIN
5. Logs in successfully
6. ✅ Kid dashboard appears
```

**Day 2+: Anyone Can Log In**
```
Parent → /parent-login (email/password)
Kid → /kid-login (PIN)
Both work because fgs_family_id persists
```

---

### For Returning Users

**Important:** `fgs_family_id` persists in localStorage even after logout!

**This means:**
- ✅ Parent logs out → family ID stays
- ✅ Kid logs out → family ID stays
- ✅ Multiple users can log in/out
- ✅ No need to re-onboard

**ONLY clears if:**
- ❌ User clears browser data
- ❌ User clears localStorage manually
- ❌ Using incognito/private mode

---

## 🚨 COMMON MISTAKES

### Mistake 1: Testing Kid Login First

**Wrong:**
```
1. Deploy app
2. Go to /kid-login
3. Error: "No family found"
```

**Right:**
```
1. Deploy app
2. Go to /parent-login FIRST
3. Log in as parent
4. Then test /kid-login
```

---

### Mistake 2: Clearing localStorage Between Tests

**Wrong:**
```
1. Parent logs in
2. Clear browser data (testing fresh state)
3. Try kid login
4. Error: "No family found" (because you cleared it!)
```

**Right:**
```
1. Parent logs in (sets family ID)
2. DON'T clear browser data
3. Just log out (family ID persists)
4. Try kid login (works!)
```

---

### Mistake 3: Using Different Browsers

**Wrong:**
```
1. Parent logs in on Chrome (sets family ID in Chrome localStorage)
2. Try kid login on Firefox (Firefox has no family ID)
3. Error: "No family found"
```

**Right:**
```
1. Parent logs in on Chrome
2. Try kid login on Chrome (same localStorage)
3. Works!

OR

1. Parent logs in on Firefox too (sets family ID there)
2. Now both browsers work
```

---

## 🎯 QUICK REFERENCE

### URLs to Bookmark

```bash
# Main app
https://your-app.netlify.app

# Parent login
https://your-app.netlify.app/parent-login

# Kid login
https://your-app.netlify.app/kid-login

# Diagnostics
https://your-app.netlify.app/system-diagnostics

# Debug storage
https://your-app.netlify.app/debug-storage
```

### localStorage Keys to Check

```javascript
// CRITICAL - must exist for kid login
fgs_family_id: "abc-123-xyz..."

// Helpful for debugging
fgs_user_id: "user-123..."
fgs_user_name: "Parent Name"
user_role: "parent" or "child"
selected_child_id: "child-123..." (when kid logged in)
kid_session_token: "kid_abc123..." (when kid logged in)
```

### Console Commands

```javascript
// Check if family ID exists
console.log('Family ID:', localStorage.getItem('fgs_family_id'));

// Check all FGS keys
console.log('FGS Keys:', Object.keys(localStorage).filter(k => k.includes('fgs')));

// Manually set family ID (for testing ONLY)
localStorage.setItem('fgs_family_id', 'your-family-uuid-here');

// Clear only FGS keys (for testing)
Object.keys(localStorage).filter(k => k.includes('fgs')).forEach(k => localStorage.removeItem(k));
```

---

## ✅ SUMMARY

**The Fix:**
1. Parent must log in first on each device/browser
2. This sets `fgs_family_id` in localStorage
3. Then kids can use PIN login

**The Tools:**
- `/system-diagnostics` - Automated health checks
- `/debug-storage` - View localStorage
- Browser console - Manual inspection

**The Flow:**
```
Parent Login (FIRST) → Sets Family ID → Kid Login Works ✅
Kid Login (FIRST) → No Family ID → Error ❌
```

---

**Updated:** February 19, 2026  
**Status:** ✅ **WORKING AS DESIGNED**  
**Note:** This is expected behavior, not a bug!
