# 🚨 QUICK FIX: "Failed to Fetch" Error on iOS

## The Problem
iOS app shows "Failed to fetch" when trying to connect to backend API.

## The Solution (90% of cases)

### ⚡ IMMEDIATE FIX - Takes 30 seconds

1. **Open Supabase Dashboard**: https://supabase.com/dashboard
2. **Select your project**: `ybrkbrrkcqpzpjnjdyib`
3. **Navigate**: Edge Functions (left sidebar) → `make-server-f116e23f` → **Settings tab**
4. **Find**: "Verify JWT" toggle
5. **Set to**: **OFF (disabled)**
6. **Wait**: 10 seconds
7. **Test**: Try your iOS app again

---

## How to Verify It's Fixed

### Option A: Use the diagnostic HTML file
1. Open `diagnose-ios-connection.html` in Safari
2. Click "Run All Tests"
3. Look for green checkmarks

### Option B: Quick test in iOS Safari Web Inspector
```javascript
// Paste this in console
fetch('https://ybrkbrrkcqpzpjnjdyib.supabase.co/functions/v1/make-server-f116e23f/health', {
  headers: { 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlicmticnJrY3FwenBqbmpkeWliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzUwOTk2MzUsImV4cCI6MjA1MDY3NTYzNX0.wDM-ZdFPHtU2Tg3XxYrJiGYWQqVR7kUikZPJCLlJNro' }
}).then(r => r.json()).then(console.log);
```

✅ **Success**: Returns `{ status: 'healthy', ... }`  
❌ **Still broken**: Returns 401 error or "Failed to fetch"

---

## If That Doesn't Work

### Check these 3 things:

#### 1. Is the device online?
```javascript
console.log('Online:', navigator.onLine);
```

#### 2. Can you reach Supabase?
```javascript
// Ping Supabase directly
fetch('https://ybrkbrrkcqpzpjnjdyib.supabase.co/rest/v1/', {
  headers: { 'apikey': 'YOUR_ANON_KEY' }
}).then(r => console.log('Supabase reachable:', r.ok));
```

#### 3. Are there CORS errors in console?
Look for red text in Safari Web Inspector console mentioning:
- "CORS"
- "Origin"
- "Access-Control-Allow-Origin"

---

## Still Not Working?

### Run the full diagnostic:
1. Open `/diagnose-ios-connection.html` in iOS Safari
2. Click "🚀 Run All Tests"
3. Screenshot the results
4. Check Supabase Edge Function logs:
   ```bash
   supabase functions logs make-server-f116e23f --project-ref ybrkbrrkcqpzpjnjdyib
   ```

---

## Why This Happens

**Supabase Edge Functions have a "Verify JWT" setting that:**
- Automatically enables on every backend code deployment
- Blocks ALL requests before they reach your code
- Strips Authorization headers
- Returns 401 errors for missing/invalid JWT tokens

**This breaks:**
- Public endpoints (signup, kid login)
- iOS Capacitor apps using `capacitor://localhost` origin
- Any request without a valid Supabase Auth JWT

**The fix:**
- Manually disable "Verify JWT" in Supabase Dashboard
- This cannot be fixed with code
- Must be done after every backend update

---

## Prevention

### Add to your deployment checklist:
```
✅ Code changes deployed
✅ Wait 30 seconds for Edge Function to deploy
✅ Open Supabase Dashboard
✅ Navigate to Edge Functions → make-server-f116e23f → Settings
✅ Disable "Verify JWT" toggle
✅ Wait 10 seconds
✅ Test health endpoint
✅ Test login flow
```

---

## Related Files
- `/IOS_FAILED_TO_FETCH_DIAGNOSTIC.md` - Full diagnostic guide
- `/VERIFY_JWT_ISSUE.md` - Original issue documentation
- `/diagnose-ios-connection.html` - Automated diagnostic tests
- `/test-edge-function.html` - Manual test page

---

## Emergency Contact
If you're completely stuck:
1. Check all files in project root for documentation
2. Review `/CURRENT_STATUS.md` for latest known state
3. Check Supabase Edge Function logs for actual error messages
4. Use Safari Web Inspector on iOS device to see network errors
