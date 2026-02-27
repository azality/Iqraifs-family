# 🔧 Troubleshooting Guide

## Current Issue: Child ID Undefined

**Error**: `GET /children/undefined 401 (Unauthorized)`  
**Root Cause**: Old test environment in localStorage OR browser cache issue

---

## ✅ SOLUTION: Use "Reset & Recreate" Button

### **Quick Fix (Recommended)**:

1. Click the **purple play button** (bottom-right corner)
2. Click **"Reset & Recreate"** (has Database icon)
3. Wait ~10-15 seconds
4. Click **"Test Child Endpoint"** (Bug icon)

This will:
- ✅ Clean up old test users
- ✅ Clear localStorage cache
- ✅ Create fresh test families
- ✅ Use correct data structure

---

## Why This Happens

### The Problem:
When test code is updated, the **localStorage still has old data** with:
- Old structure (wrong field names)
- Old IDs (from previous test runs)
- Cached browser state

### The Fix:
The **"Reset & Recreate"** button:
1. Deletes old test users from database
2. Clears localStorage
3. Creates fresh test environment
4. Ensures correct structure

---

## Step-by-Step Recovery

### **Option 1: Automated (Easiest)** ⭐

Click buttons in this order:
```
1. "Reset & Recreate"       ← Cleans and recreates everything
2. "Test Child Endpoint"    ← Verifies endpoint works
3. "Audit Test Environment" ← Full system check
```

### **Option 2: Manual**

If buttons don't work:

```javascript
// 1. Clear localStorage
localStorage.removeItem('fgs_test_environment');

// 2. Cleanup users (in browser console)
const { projectId, publicAnonKey } = await import('./utils/supabase/info');
await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/test/cleanup`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${publicAnonKey}`
  }
});

// 3. Hard refresh page
location.reload(true);

// 4. Click "Setup Test Families" button
```

---

## Understanding the Errors

### Error 1: `Child ID: undefined`
```
📋 Test Setup:
   Child ID: undefined  ← PROBLEM!
```

**Cause**: Test environment structure mismatch  
**Fix**: Click "Reset & Recreate"

---

### Error 2: `hasAuthHeader: false`
```
❌ requireAuth: Token verification failed {
  hasAuthHeader: false,
  path: "/make-server-f116e23f/children/undefined"
}
```

**Cause**: Because childId is undefined, request URL is invalid, so token isn't sent  
**Fix**: Click "Reset & Recreate" (fixes childId, which fixes token)

---

### Error 3: `Multiple GoTrueClient instances`
```
⚠️ Multiple GoTrueClient instances detected
```

**Cause**: Tests creating separate Supabase clients (FIXED)  
**Status**: Not critical, will resolve after "Reset & Recreate"

---

## Expected Output After Fix

### **Test Child Endpoint** should show:
```
🧪 ========================================
🧪 TESTING CHILD ENDPOINT
🧪 ========================================

🔍 Debug: Test environment structure:
   familyA exists: true
   familyA.children exists: true
   familyA.children length: 2
   familyA.children[0]: {childId: 'child:1771644029229', name: 'Kid A1', ...}

📋 Test Setup:
   Child ID: child:1771644029229  ✅
   Child Name: Kid A1  ✅
   Family A Parent 1: parent-a1@fgs-test.com  ✅

🔐 Signing in as Family A Parent 1...
✅ Signed in successfully
   User ID: c3a58e64-9a9e-40ae-b283-c188c440b3cb
   Token preview: eyJhbGciOiJFUzI1NiIsImtpZCI6Ij...

📡 Test 1: GET /children/:id WITH auth token
   Status: 200 OK  ✅ (or 401 if "Verify JWT" enabled)
   Response: {id: 'child:...', name: 'Kid A1', ...}
   ✅ Endpoint working correctly!

📡 Test 2: GET /children/:id WITHOUT auth token
   Status: 401 Unauthorized  ✅
   ✅ Correctly requires authentication

📡 Test 3: GET /health (sanity check)
   Status: 200 OK  ✅
   ✅ Edge Function is deployed and responding

📊 SUMMARY:
   Health endpoint: ✅ OK
   Auth required: ✅ YES
   Authenticated access: ✅ SUCCESS (or ❌ if JWT verification enabled)
```

---

## Common Issues After "Reset & Recreate"

### Issue: Still getting 401 on authenticated request

**Symptom**:
```
📊 SUMMARY:
   Health endpoint: ✅ OK
   Auth required: ✅ YES
   Authenticated access: ❌ FAILED

⚠️  ACTION REQUIRED:
   Go to Supabase Dashboard → Functions → make-server-f116e23f → Settings
   Disable "Verify JWT" toggle
```

**Fix**:
1. Open Supabase Dashboard
2. Navigate to **Edge Functions** → **make-server-f116e23f** → **Settings**
3. **Disable "Verify JWT"** toggle
4. Wait 10 seconds
5. Click **"Test Child Endpoint"** again

---

### Issue: Health endpoint fails

**Symptom**:
```
📊 SUMMARY:
   Health endpoint: ❌ FAILED
```

**Fix**:
1. Check Supabase Dashboard → Functions → Logs
2. Verify Edge Function is deployed
3. Wait 30 seconds and try again
4. If still failing, check Supabase project status

---

## Verification Checklist

After clicking **"Reset & Recreate"**, verify:

- [ ] Console shows: `✅ Cleanup complete`
- [ ] Console shows: `✅ localStorage cleared`
- [ ] Console shows: `🎉 TEST ENVIRONMENT READY!`
- [ ] Console shows family IDs like `family:1771644027771`
- [ ] Console shows child IDs like `child:1771644029229`

Then click **"Test Child Endpoint"** and verify:
- [ ] Child ID is NOT undefined
- [ ] Child name shows: `Kid A1`
- [ ] Health endpoint: ✅ OK
- [ ] Auth required: ✅ YES
- [ ] Authenticated access: ✅ SUCCESS (or ❌ with JWT instructions)

---

## Debug Commands

### Check localStorage structure:
```javascript
const testEnv = JSON.parse(localStorage.getItem('fgs_test_environment'));
console.log('Family A:', testEnv.familyA);
console.log('Children:', testEnv.familyA.children);
console.log('First child:', testEnv.familyA.children[0]);
console.log('Child ID:', testEnv.familyA.children[0].childId);
```

### Manual cleanup:
```javascript
// Clear localStorage
localStorage.clear();

// Or just test environment
localStorage.removeItem('fgs_test_environment');
```

### Check Supabase auth state:
```javascript
const { supabase } = await import('./utils/supabase/client');
const { data } = await supabase.auth.getSession();
console.log('Signed in:', !!data.session);
console.log('User ID:', data.session?.user?.id);
console.log('Token:', data.session?.access_token?.substring(0, 50));
```

---

## Still Not Working?

### Nuclear Option (Last Resort):

1. **Hard Refresh**: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
2. **Clear All Cache**:
   ```javascript
   localStorage.clear();
   sessionStorage.clear();
   ```
3. **Close and reopen browser**
4. **Reopen Figma Make**
5. **Click "Reset & Recreate"**

---

## Success Criteria

You know it's working when:
- ✅ Child ID is NOT undefined
- ✅ Token is being sent (no `hasAuthHeader: false`)
- ✅ Health check passes
- ✅ Either:
  - Authenticated endpoint returns 200 OK, OR
  - Shows clear "Verify JWT" instructions

---

**Last Updated**: 2026-02-21 03:30 UTC
