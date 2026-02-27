# 🔧 Supabase Edge Function JWT Verification Issue - Diagnostic Guide

## ❌ Problem: "Failed to fetch" Error

Your iOS app is experiencing network errors when trying to call the Supabase Edge Function. Requests never reach your backend code despite having correct authentication tokens.

## 🎯 Root Cause

**Supabase Edge Functions has a "Verify JWT" setting that blocks requests BEFORE they reach your code.**

When enabled, Supabase validates JWT tokens at the infrastructure level. If validation fails or the token format is unexpected, requests are rejected with a network error and never reach your backend logic.

## ✅ Solution: Disable "Verify JWT"

### Step-by-Step Instructions:

1. **Open Supabase Dashboard**
   - Go to: https://supabase.com/dashboard/project/ybrkbrrkcqpzpjnjdyib

2. **Navigate to Edge Functions**
   - Click **"Edge Functions"** in the left sidebar
   - Find your function: `make-server-f116e23f`
   - Click on it to open

3. **Access Function Settings**
   - Click the **"Settings"** tab
   - Look for **"Verify JWT"** toggle

4. **Disable JWT Verification**
   - Toggle **OFF** the "Verify JWT" setting
   - Click **"Save"** or **"Update Function"**

5. **Verify the Change**
   - The setting should now show as **disabled**
   - Wait 10-15 seconds for the change to propagate

## 🧪 Test the Fix

### Option 1: Use the HTML Test File

Open `/test-edge-function.html` in your browser:

```bash
# If using a local server:
open test-edge-function.html
```

Click the buttons in this order:
1. **Test Health Endpoint** - Should return 200 OK
2. **Test CORS Preflight** - Should return proper CORS headers
3. **Test With Auth Token** - Should reach backend (may return 401, but that's expected)

**What to look for:**
- ✅ All requests should complete (not fail with network error)
- ✅ You should see response data (even if it's an error response)
- ❌ If you see "Failed to fetch", JWT verification is still enabled

### Option 2: Test from iOS App

1. Build and run the iOS app
2. Try to log in with valid credentials
3. Check the console logs in Xcode

**Expected behavior:**
- ✅ Request reaches the backend
- ✅ Backend logs appear in Supabase dashboard
- ✅ Login succeeds or fails with a proper error message
- ❌ No "Failed to fetch" errors

### Option 3: Test with cURL

```bash
# Test health endpoint (no auth required)
curl -i https://ybrkbrrkcqpzpjnjdyib.supabase.co/functions/v1/make-server-f116e23f/health \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlicmticnJrY3FwenBqbmpkeWliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNjUzMTcsImV4cCI6MjA4Njk0MTMxN30.RmagHyYi_-Q2wBG8ik1kxNTIYVfCuUcCyJqcDbz2mc8"

# Test authenticated endpoint (should reach backend and return 401)
curl -i https://ybrkbrrkcqpzpjnjdyib.supabase.co/functions/v1/make-server-f116e23f/families \
  -H "Authorization: Bearer test_token" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlicmticnJrY3FwenBqbmpkeWliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNjUzMTcsImV4cCI6MjA4Njk0MTMxN30.RmagHyYi_-Q2wBG8ik1kxNTIYVfCuUcCyJqcDbz2mc8"
```

**Expected response for health endpoint:**
- Status: 200 OK
- Body: JSON with health status

**Expected response for families endpoint:**
- Status: 401 Unauthorized (because test_token is invalid)
- Body: JSON with error message
- **Important:** You should get a response, not a network error

## 🔍 Why This Happens

### With JWT Verification ENABLED:
```
iOS App → Supabase Gateway → JWT Validator → ❌ REJECTED → Network Error
                                    ↓
                            (Your code never runs)
```

### With JWT Verification DISABLED:
```
iOS App → Supabase Gateway → Your Edge Function → Your Auth Middleware → ✅ Proper Response
                                                              ↓
                                                    (You control auth logic)
```

## 📋 Checklist

- [ ] Opened Supabase Dashboard
- [ ] Found Edge Function settings
- [ ] Disabled "Verify JWT" toggle
- [ ] Saved the changes
- [ ] Waited 10-15 seconds
- [ ] Tested with health endpoint (got 200 OK)
- [ ] Tested from iOS app (no more "Failed to fetch")
- [ ] Confirmed backend logs appear in Supabase

## 🚨 Still Having Issues?

If you still see "Failed to fetch" after disabling JWT verification:

1. **Check Function Deployment Status**
   - In Supabase Dashboard → Edge Functions
   - Ensure function status is "Active" (green)
   - Try redeploying if necessary

2. **Verify Supabase URL**
   - Confirm: `ybrkbrrkcqpzpjnjdyib.supabase.co`
   - Check `/utils/supabase/info.tsx` matches

3. **Check Network Connectivity**
   - Test from browser first
   - Then test from iOS simulator
   - Finally test from physical device

4. **Review Backend Logs**
   - Go to: Supabase Dashboard → Edge Functions → Logs
   - Look for incoming requests
   - If you don't see any logs, requests aren't reaching the function

5. **CORS Issues** (unlikely after our fixes, but possible)
   - Check browser console for CORS errors
   - Verify `Access-Control-Allow-Origin` header is present

## 💡 Why We Control Auth in Code

Your backend already has comprehensive authentication middleware:
- `requireAuth` - Validates Supabase JWT tokens
- `requireParent` - Ensures user has parent role
- `requireFamilyAccess` - Validates family membership
- `requireChildAccess` - Validates child access

This gives you:
- ✅ Full control over auth logic
- ✅ Better error messages
- ✅ Custom business rules
- ✅ Detailed logging
- ✅ Rate limiting integration

Supabase's JWT verification is redundant and causes issues with your custom auth flow.

## 📞 Next Steps

After disabling JWT verification:

1. Test login flow in iOS app
2. Verify family data loads correctly
3. Check that all authenticated endpoints work
4. Review backend logs for any remaining issues
5. Continue with TestFlight deployment

---

**Last Updated:** February 26, 2026  
**Project:** Family Growth System (FGS)  
**Function:** make-server-f116e23f  
**Project ID:** ybrkbrrkcqpzpjnjdyib
