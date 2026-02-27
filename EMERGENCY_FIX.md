# 🚨 EMERGENCY FIX - "Failed to Fetch" Error

```
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║           YOUR APP SHOWS "FAILED TO FETCH"               ║
║                                                          ║
║                  HERE'S THE FIX:                         ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
```

## The Problem
```
❌ TypeError: Failed to fetch
URL: .../make-server-f116e23f/families
```

## The Fix (30 seconds)

### 1️⃣ Open This URL
```
https://supabase.com/dashboard
```

### 2️⃣ Navigate Here
```
Project: ybrkbrrkcqpzpjnjdyib
    ↓
Edge Functions
    ↓
make-server-f116e23f
    ↓
Settings tab
```

### 3️⃣ Find This Toggle
```
☑ Verify JWT   ← Currently CHECKED (BAD)
```

### 4️⃣ Change It To This
```
☐ Verify JWT   ← Now UNCHECKED (GOOD)
```

### 5️⃣ Wait & Test
```
Wait: 10 seconds
Test: Your app should work! ✅
```

---

## Verify It Worked

**Test this URL in browser:**
```
https://ybrkbrrkcqpzpjnjdyib.supabase.co/functions/v1/make-server-f116e23f/health
```

**Should show:**
```json
{ "status": "healthy", ... }
```

**If shows 401 error:**
- Wait 10 more seconds
- Refresh browser
- Check Dashboard - toggle still OFF?

---

## Still Not Working?

**Run this diagnostic:**
```
Open: /diagnose-now.html
Click: "Run Full Diagnostic"
```

It will tell you exactly what's wrong.

---

## Why This Happens

Supabase has a "Verify JWT" setting that:
- ❌ Blocks ALL requests without valid JWT
- ❌ Auto-enables on EVERY deployment
- ❌ Returns "Failed to fetch" errors

**Solution**: Disable it in Dashboard after each deployment.

---

## Next Time You Deploy Backend

```
1. Deploy code
2. Wait 30 seconds
3. Go to Dashboard
4. Disable "Verify JWT" again
5. Test app
```

**Add this to your deployment checklist!**

---

```
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║  That's it! Just toggle a switch in Supabase Dashboard.  ║
║                                                          ║
║                  Go fix it now! 🚀                       ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
```

---

## Documentation

- **Full guide**: `/SUPABASE_DASHBOARD_STEPS.md`
- **Diagnostic**: `/diagnose-now.html`
- **Troubleshooting**: `/TROUBLESHOOTING_FLOWCHART.md`
- **Quick ref**: `/QUICK_FIX_FAILED_TO_FETCH.md`
