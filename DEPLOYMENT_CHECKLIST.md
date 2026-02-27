# 🚀 Backend Deployment Checklist

**Current Issue**: GET /children/:id returns 401 Unauthorized  
**Expected**: Should return 200 OK or 403 Forbidden (with proper auth)

---

## Pre-Flight Check

### ✅ 1. Code Changes Committed
- [x] Added `GET /children/:id` endpoint (line ~801-823)
- [x] Added `GET /families/:familyId/children` endpoint (line ~401-427)
- [x] Both use proper authentication middleware
- [x] Both remove PINs from responses

---

## Deployment Steps

### Step 1: Wait for Edge Function Deployment
**Time Required**: 15-30 seconds after last code save

**How to verify**:
```
1. Save timestamp of last code change
2. Wait 30 seconds
3. Continue to Step 2
```

---

### Step 2: 🚨 CRITICAL - Disable "Verify JWT"

**This is the #1 cause of 401 errors!**

1. Open **Supabase Dashboard** in new tab
2. Navigate to: **Edge Functions** (left sidebar)
3. Click: **make-server-f116e23f**
4. Click: **Settings** tab
5. Find toggle: **"Verify JWT"**
6. **Turn it OFF** (disabled)
7. Wait 5-10 seconds for change to apply

**Why**: This setting auto-enables on every deployment and blocks ALL requests

---

### Step 3: Run Diagnostic Test

Click **"Test Child Endpoint"** button (new bug icon 🐛)

**Expected Output**:
```
✅ Health endpoint: OK
✅ Auth required: YES (401 without token)
✅ Authenticated access: SUCCESS (200 with token)
```

**If you see 401 on authenticated request**:
- ❌ "Verify JWT" is still enabled → Go back to Step 2
- ❌ Edge Function not deployed yet → Wait longer, refresh Supabase dashboard

**If you see 404**:
- ❌ Endpoint not deployed → Check Supabase Edge Function logs
- ❌ Wrong URL → Check projectId in browser console

---

### Step 4: Run Full Audit

Click **"Audit Test Environment"**

**Expected Results After Fix**:
- ✅ PIN Hashing tests pass (was 401, now should be 200)
- ✅ Family structure tests pass  
- ✅ Data integrity tests pass
- ✅ Cross-family isolation returns 403 (this is CORRECT!)

**Still Acceptable "Failures"**:
- ❌ Family B cross-family access (403) = SECURITY WORKING ✅
  - Audit signed in as Family A parent
  - Trying to access Family B data
  - 403 Forbidden is the CORRECT response

---

## Troubleshooting Guide

### Issue: GET /children/:id returns 401

**Diagnosis Steps**:

1. **Check "Verify JWT" setting**
   ```
   Supabase Dashboard → Functions → Settings → "Verify JWT" = OFF
   ```
   If ON: Disable it and wait 10 seconds

2. **Check Edge Function deployment**
   ```
   Supabase Dashboard → Functions → Logs
   Look for: "Function deployed" message
   ```
   If missing: Wait 30 more seconds, hard refresh dashboard

3. **Check health endpoint**
   ```javascript
   // In browser console:
   const { projectId, publicAnonKey } = await import('./utils/supabase/info');
   const r = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/health`);
   console.log(r.status, await r.json());
   ```
   Expected: `200 { status: 'ok' }`
   If 401: "Verify JWT" is still enabled!

4. **Check auth token**
   ```javascript
   // In browser console:
   const { createClient } = await import('@supabase/supabase-js');
   const { projectId, publicAnonKey } = await import('./utils/supabase/info');
   const supabase = createClient(`https://${projectId}.supabase.co`, publicAnonKey);
   const { data } = await supabase.auth.getSession();
   console.log('Token:', data.session?.access_token?.substring(0, 50));
   ```
   Expected: Should see JWT token starting with "eyJ..."
   If null: Not signed in, run setup again

5. **Check Edge Function logs**
   ```
   Supabase Dashboard → Functions → make-server-f116e23f → Logs
   Look for: "requireAuth middleware called"
   Look for: "Token verification failed"
   ```
   
---

## Manual Verification (Without Tests)

### Test Endpoint Manually:

```javascript
// 1. Get test environment
const testEnv = JSON.parse(localStorage.getItem('fgs_test_environment'));
const childId = testEnv.familyA.children[0].id;

// 2. Get auth token
const { createClient } = await import('@supabase/supabase-js');
const { projectId, publicAnonKey } = await import('./utils/supabase/info');
const supabase = createClient(`https://${projectId}.supabase.co`, publicAnonKey);

const { data } = await supabase.auth.signInWithPassword({
  email: testEnv.familyA.parents[0].email,
  password: 'TestPassword123!'
});

const token = data.session.access_token;

// 3. Test endpoint
const response = await fetch(
  `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${childId}`,
  {
    headers: { 'Authorization': `Bearer ${token}` }
  }
);

console.log('Status:', response.status);
console.log('Data:', await response.json());

// Expected:
// Status: 200
// Data: { id: '...', name: 'Kid A1', familyId: '...', avatar: '...', currentPoints: 0, ... }
// NOTE: Should NOT have 'pin' field!
```

---

## Success Criteria

### ✅ All Systems Go When:

1. **Health check** returns 200 OK
2. **Unauthenticated request** to /children/:id returns 401
3. **Authenticated request** to /children/:id returns 200 OK
4. **Response** does NOT contain 'pin' field
5. **Cross-family request** returns 403 Forbidden
6. **Audit** shows 9-10 tests passing (with expected 403s)

---

## Common Mistakes

❌ **Mistake 1**: Forgetting to disable "Verify JWT"
   - Symptom: ALL endpoints return 401
   - Fix: Disable in Supabase Dashboard

❌ **Mistake 2**: Not waiting for deployment
   - Symptom: 404 Not Found
   - Fix: Wait 30 seconds, refresh dashboard

❌ **Mistake 3**: Thinking 403 is a failure
   - Cross-family access SHOULD return 403
   - This is security working correctly!

❌ **Mistake 4**: Using wrong token
   - publicAnonKey ≠ access_token
   - Use session.access_token from signInWithPassword

---

## Timeline

**Estimated time from code save to working**:
- Edge Function deployment: 15-30 seconds
- Disable "Verify JWT": 10 seconds
- Run diagnostic test: 5 seconds
- **Total: ~1 minute**

---

## Next Steps After Success

Once diagnostic test passes:
1. ✅ Run full audit
2. ✅ Document any remaining expected 403s
3. ✅ Begin comprehensive system testing
4. ✅ Test kid login flow
5. ✅ Test parent operations

---

## Emergency Rollback

If endpoint still doesn't work after 5 minutes:

1. Check Supabase Edge Function logs for errors
2. Verify middleware.tsx was deployed correctly
3. Try clearing browser cache + hard refresh
4. Sign out and sign in again
5. Delete and recreate test environment

---

**Last Updated**: 2026-02-21  
**Author**: FGS Development Team
