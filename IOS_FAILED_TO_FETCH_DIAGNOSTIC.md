# 🚨 iOS "Failed to Fetch" Error - Complete Diagnostic & Fix Guide

## Problem Summary
iOS app cannot connect to Supabase Edge Function - API requests fail with "Failed to fetch" error even though:
- ✅ Health checks work in browser
- ✅ Backend is deployed and running
- ✅ CORS is configured to allow all origins (temporarily)

## Root Cause Analysis

The error occurs because **Supabase Edge Functions have a "Verify JWT" setting that auto-enables on deployment** and blocks requests before they reach your code.

### What "Verify JWT" Does:
1. **Strips the Authorization header** from ALL incoming requests
2. **Validates the JWT** against Supabase's auth database
3. **Rejects requests** without valid Supabase Auth JWT tokens
4. **Runs BEFORE your code** - so your CORS and logging never execute

### Why It Affects iOS More Than Browser:
- Browser may have cached Supabase Auth sessions
- iOS Capacitor uses `capacitor://localhost` origin which may trigger stricter validation
- iOS makes fresh requests without browser session state

---

## IMMEDIATE FIX (Required - Dashboard Only)

### Step 1: Disable JWT Verification in Supabase Dashboard

**This MUST be done manually - it cannot be fixed with code:**

1. Go to: https://supabase.com/dashboard
2. Select your project
3. Click **"Edge Functions"** in left sidebar
4. Click on **"make-server-f116e23f"** function
5. Click the **"Settings"** tab
6. Find the **"Verify JWT"** toggle
7. Set it to **OFF (disabled)**
8. Wait 10 seconds for the change to propagate

### Step 2: Verify the Fix

Run this test in your iOS app's web inspector console:

```javascript
// Test health endpoint (no auth required)
const response = await fetch(
  'https://ybrkbrrkcqpzpjnjdyib.supabase.co/functions/v1/make-server-f116e23f/health',
  {
    headers: {
      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlicmticnJrY3FwenBqbmpkeWliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzUwOTk2MzUsImV4cCI6MjA1MDY3NTYzNX0.wDM-ZdFPHtU2Tg3XxYrJiGYWQqVR7kUikZPJCLlJNro'
    }
  }
);
console.log('Status:', response.status);
console.log('Data:', await response.json());
```

**Expected Result:**
- ✅ Status: 200
- ✅ Data: `{ status: 'healthy', ... }`

**If JWT is still enabled:**
- ❌ Status: 401
- ❌ Data: `"Missing authorization header"` or similar

---

## DIAGNOSTIC TESTS

### Test 1: Verify Edge Function is Running

```bash
# In terminal
curl https://ybrkbrrkcqpzpjnjdyib.supabase.co/functions/v1/make-server-f116e23f/health \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlicmticnJrY3FwenBqbmpkeWliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzUwOTk2MzUsImV4cCI6MjA1MDY3NTYzNX0.wDM-ZdFPHtU2Tg3XxYrJiGYWQqVR7kUikZPJCLlJNro"
```

**Expected:** JSON response with `status: healthy`

### Test 2: Check Supabase Edge Function Logs

```bash
# View real-time logs
supabase functions logs make-server-f116e23f --project-ref ybrkbrrkcqpzpjnjdyib
```

Look for:
- ✅ "Incoming request" logs (means request reached your code)
- ✅ "CORS Check" logs (means CORS middleware ran)
- ❌ No logs at all (means JWT verification blocked request before code)

### Test 3: iOS Safari Web Inspector

1. Connect iOS device to Mac
2. Open Safari → Develop → [Your iOS Device] → [Your App]
3. Open Console
4. Trigger an API call in the app
5. Look for:
   - Network errors in Console
   - Failed fetch details
   - CORS errors (look for red text mentioning "CORS" or "Origin")

---

## SECONDARY ISSUES (If JWT Fix Doesn't Work)

### Issue A: Capacitor Origin Not Allowed

**Symptom:** CORS error mentioning `capacitor://localhost`

**Fix:** Already implemented - CORS allows all origins in debug mode

**Verify in code:** `/supabase/functions/server/index.tsx` lines 94-109

### Issue B: Missing apikey Header

**Symptom:** 401 error with "apikey required" or similar

**Fix:** Already implemented - all API calls include apikey header

**Verify in code:** `/src/utils/api.ts` line 65

### Issue C: SSL/TLS Certificate Issues on iOS

**Symptom:** "Failed to fetch" with no additional details

**Possible causes:**
- iOS doesn't trust Supabase's SSL certificate (unlikely)
- App Transport Security (ATS) blocks HTTP requests

**Fix:** Add to `ios/App/App/Info.plist` (if not already present):

```xml
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSAllowsArbitraryLoads</key>
  <false/>
  <key>NSExceptionDomains</key>
  <dict>
    <key>supabase.co</key>
    <dict>
      <key>NSExceptionAllowsInsecureHTTPLoads</key>
      <false/>
      <key>NSIncludesSubdomains</key>
      <true/>
      <key>NSExceptionRequiresForwardSecrecy</key>
      <true/>
      <key>NSExceptionMinimumTLSVersion</key>
      <string>TLSv1.2</string>
    </dict>
  </dict>
</dict>
```

---

## MONITORING & DEBUGGING

### Enable Detailed iOS Logging

Add this to your `ios/App/App/AppDelegate.swift`:

```swift
import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    // Enable verbose logging
    if #available(iOS 14.0, *) {
      print("[FGS] App launched - iOS \(ProcessInfo.processInfo.operatingSystemVersion)")
    }
    return true
  }
  
  // Log all URL requests (helps debug network issues)
  func application(_ application: UIApplication, handleOpen url: URL) -> Bool {
    print("[FGS] Opening URL: \(url)")
    return ApplicationDelegateProxy.shared.application(application, open: url, options: [:])
  }
}
```

### Check iOS Device Logs

1. Connect device to Mac
2. Open **Console.app** (macOS)
3. Select your iOS device
4. Filter for "FGS" or "fetch" or "network"
5. Look for detailed error messages

---

## VERIFICATION CHECKLIST

After disabling JWT verification, verify these work:

```javascript
// Run these in iOS Safari Web Inspector Console

// 1. Health check (no auth)
await fetch('https://ybrkbrrkcqpzpjnjdyib.supabase.co/functions/v1/make-server-f116e23f/health', {
  headers: { 'apikey': 'YOUR_ANON_KEY' }
}).then(r => r.json());

// 2. CORS preflight
await fetch('https://ybrkbrrkcqpzpjnjdyib.supabase.co/functions/v1/make-server-f116e23f/health', {
  method: 'OPTIONS',
  headers: { 
    'apikey': 'YOUR_ANON_KEY',
    'Access-Control-Request-Method': 'GET',
    'Access-Control-Request-Headers': 'Authorization, Content-Type'
  }
}).then(r => r.status); // Should be 204

// 3. Authenticated request (with valid token)
await fetch('https://ybrkbrrkcqpzpjnjdyib.supabase.co/functions/v1/make-server-f116e23f/families/YOUR_FAMILY_ID/children', {
  headers: { 
    'apikey': 'YOUR_ANON_KEY',
    'Authorization': 'Bearer YOUR_ACCESS_TOKEN',
    'Content-Type': 'application/json'
  }
}).then(r => r.json());
```

---

## COMMON MISTAKES

### ❌ Mistake 1: Thinking CORS is the issue
**Reality:** If JWT verification is enabled, CORS never runs - the request is blocked before your code executes.

### ❌ Mistake 2: Adding more headers to fix it
**Reality:** More headers won't help - the Authorization header is being stripped by Supabase before your code sees it.

### ❌ Mistake 3: Trying to fix it in code
**Reality:** JWT verification is a Supabase platform setting - it CANNOT be disabled via code or environment variables.

---

## PERMANENT SOLUTION

The JWT verification setting **resets to ON** every time you deploy backend code changes. To prevent this:

### Option 1: Manual Process (Current)
- Add deployment checklist reminder
- Always disable JWT after backend updates
- Document in team wiki/runbook

### Option 2: Separate Edge Functions (Future Consideration)
Create two Edge Functions:
- `make-server-public` - No JWT verification (signup, kid login, public endpoints)
- `make-server-protected` - JWT required (all authenticated endpoints)

This requires:
- Splitting your codebase
- Routing logic in frontend
- More complex deployment

**Recommendation:** Stick with Option 1 for now - it's simpler and works well.

---

## NEXT STEPS

1. **IMMEDIATE:** Disable JWT verification in Supabase Dashboard
2. **VERIFY:** Run health check test from iOS app
3. **TEST:** Try logging in from iOS app
4. **MONITOR:** Check Supabase Edge Function logs for incoming requests
5. **DOCUMENT:** Add "Disable JWT" step to your deployment checklist

---

## SUCCESS INDICATORS

You'll know it's fixed when:
- ✅ Health endpoint returns 200 from iOS app
- ✅ Login works from iOS app
- ✅ You see request logs in Supabase Edge Function logs
- ✅ No more "Failed to fetch" errors in iOS console

---

## SUPPORT

If JWT verification is disabled and you still get "Failed to fetch":

1. Check iOS Safari Web Inspector Console for CORS errors
2. Check Supabase Edge Function logs - are requests reaching the backend?
3. Try the standalone test HTML file: `/test-edge-function.html`
4. Check iOS device logs in Console.app for network errors
5. Verify your internet connection on the iOS device

---

## Related Documentation

- See: `/VERIFY_JWT_ISSUE.md` - Original diagnosis
- See: `/SUPABASE_JWT_FIX.md` - Supabase-specific fix guide
- See: `/IOS_DEPLOYMENT_GUIDE.md` - Full iOS deployment steps
