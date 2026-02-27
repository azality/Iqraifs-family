# 📋 Supabase Dashboard: Disable JWT Verification

## Visual Step-by-Step Guide

### Step 1: Open Supabase Dashboard
```
🌐 URL: https://supabase.com/dashboard
```

### Step 2: Select Your Project
```
Click on: ybrkbrrkcqpzpjnjdyib
```

### Step 3: Navigate to Edge Functions
```
Left Sidebar → Edge Functions (icon looks like ⚡ or λ)
```

### Step 4: Select Your Function
```
Click on: make-server-f116e23f
```

### Step 5: Open Settings Tab
```
Top tabs: Details | Logs | Metrics | [Settings] ← Click here
```

### Step 6: Find Verify JWT Setting
```
Scroll down to: "Authorization"
or search for: "Verify JWT"

You'll see a toggle switch labeled:
□ Verify JWT
```

### Step 7: Disable JWT Verification
```
Click the toggle to turn it OFF:
☐ Verify JWT (grayed out / disabled)

The toggle should now be in the "off" position.
```

### Step 8: Wait for Change to Propagate
```
⏱️ Wait: 10-15 seconds
(Supabase needs time to apply the setting)
```

### Step 9: Verify It's Working
```
Test the health endpoint in browser:
https://ybrkbrrkcqpzpjnjdyib.supabase.co/functions/v1/make-server-f116e23f/health

✅ Should return: { "status": "healthy", ... }
❌ If 401 error: Wait another 10 seconds and try again
```

---

## Visual Reference

### What You're Looking For:

```
┌─────────────────────────────────────────────────────┐
│ Settings Tab                                         │
├─────────────────────────────────────────────────────┤
│                                                      │
│ General                                              │
│ ├─ Function Name: make-server-f116e23f              │
│ ├─ Region: us-west-1                                │
│ └─ ...                                               │
│                                                      │
│ Authorization ⬅️ LOOK FOR THIS SECTION               │
│ ├─ Verify JWT                                       │
│ │  ☐ Enforce JWT verification on all requests      │ ⬅️ TOGGLE THIS OFF
│ │  When enabled, all requests must include a       │
│ │  valid JWT token in the Authorization header     │
│ └─ ...                                               │
│                                                      │
│ Environment Variables                                │
│ └─ ...                                               │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## What the Setting Does

### When ENABLED (☑ Verify JWT):
```
Request Flow:
  Your App 
    ↓ (sends request with Authorization: Bearer <token>)
  Supabase Platform
    ↓ (checks if JWT is valid Supabase Auth token)
    ├─ Valid? → Continue to your code ✅
    └─ Invalid? → Return 401 error ❌ (NEVER REACHES YOUR CODE)
  Your Edge Function Code
    ↓ (only reached if JWT was valid)
```

**Result**: 
- ❌ Public endpoints (signup, kid login) get 401 errors
- ❌ Authorization header is stripped before reaching your code
- ❌ Your CORS middleware never runs
- ❌ Your logging never executes
- ❌ iOS app cannot connect

### When DISABLED (☐ Verify JWT):
```
Request Flow:
  Your App 
    ↓ (sends request)
  Supabase Platform
    ↓ (passes request through without checking)
  Your Edge Function Code
    ↓ (receives FULL request with all headers)
    ↓ (your middleware handles authorization)
    ↓ (your CORS middleware runs)
    ↓ (your logging works)
```

**Result**: 
- ✅ All requests reach your code
- ✅ You handle authorization in middleware
- ✅ Public endpoints work
- ✅ iOS app can connect

---

## Troubleshooting

### "I don't see the Settings tab"
**Fix**: Make sure you clicked on the function name (`make-server-f116e23f`), not just the Edge Functions section.

### "I don't see the Verify JWT toggle"
**Possible reasons**:
1. You're in the wrong tab (make sure you're in "Settings", not "Details" or "Logs")
2. Scroll down - it might be below other settings
3. Supabase UI changed - look for "Authorization" section
4. Your account doesn't have permission (need Owner or Admin role)

### "I disabled it but still getting 401 errors"
**Try**:
1. Wait 30 seconds (Supabase caches settings)
2. Refresh the browser
3. Clear browser cache
4. Try from incognito/private window
5. Check if it re-enabled itself (sometimes happens after deployments)

### "The toggle keeps turning back ON"
**This is normal!** The toggle auto-enables after every backend code deployment.

**Solution**: Add this to your deployment process:
```bash
# After deploying backend changes:
1. Deploy code
2. Wait 30 seconds
3. Open Supabase Dashboard
4. Disable "Verify JWT"
5. Test app
```

---

## Verification Commands

### Test from command line (Terminal):
```bash
# Should return 200 with JSON
curl -i https://ybrkbrrkcqpzpjnjdyib.supabase.co/functions/v1/make-server-f116e23f/health \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlicmticnJrY3FwenBqbmpkeWliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzUwOTk2MzUsImV4cCI6MjA1MDY3NTYzNX0.wDM-ZdFPHtU2Tg3XxYrJiGYWQqVR7kUikZPJCLlJNro"
```

### Test from browser console:
```javascript
// Should log healthy status
fetch('https://ybrkbrrkcqpzpjnjdyib.supabase.co/functions/v1/make-server-f116e23f/health', {
  headers: { 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlicmticnJrY3FwenBqbmpkeWliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzUwOTk2MzUsImV4cCI6MjA1MDY3NTYzNX0.wDM-ZdFPHtU2Tg3XxYrJiGYWQqVR7kUikZPJCLlJNro' }
}).then(r => r.json()).then(console.log);
```

### Test from iOS Safari Web Inspector:
```javascript
// Connect iOS device to Mac
// Safari → Develop → [Your iPhone] → [Your App]
// Console tab → Paste this:

fetch('https://ybrkbrrkcqpzpjnjdyib.supabase.co/functions/v1/make-server-f116e23f/health', {
  headers: { 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlicmticnJrY3FwenBqbmpkeWliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzUwOTk2MzUsImV4cCI6MjA1MDY3NTYzNX0.wDM-ZdFPHtU2Tg3XxYrJiGYWQqVR7kUikZPJCLlJNro' }
}).then(r => r.json()).then(console.log);
```

---

## Expected Results

### ✅ Success (JWT Verification Disabled):
```json
{
  "status": "healthy",
  "timestamp": "2025-02-26T...",
  "metrics": { ... }
}
```

### ❌ Failed (JWT Verification Still Enabled):
```
401 Unauthorized
"Missing authorization header"
```
or
```
401 Unauthorized
"Invalid JWT token"
```

---

## Quick Reference Card

```
╔════════════════════════════════════════════════════╗
║  DISABLE JWT VERIFICATION - QUICK STEPS            ║
╠════════════════════════════════════════════════════╣
║  1. supabase.com/dashboard                         ║
║  2. Select project: ybrkbrrkcqpzpjnjdyib          ║
║  3. Edge Functions → make-server-f116e23f          ║
║  4. Settings tab                                   ║
║  5. Find "Verify JWT" toggle                       ║
║  6. Turn it OFF                                    ║
║  7. Wait 10 seconds                                ║
║  8. Test: /health endpoint                         ║
╚════════════════════════════════════════════════════╝
```

Print this and keep it by your desk! 📌
