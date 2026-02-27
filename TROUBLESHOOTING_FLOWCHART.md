# 🔍 "Failed to Fetch" Troubleshooting Flowchart

```
                    START: iOS app shows "Failed to fetch"
                                    |
                                    v
                    ┌───────────────────────────────┐
                    │ Can you reach Supabase.co     │
                    │ in Safari on iOS?             │
                    └───────────────┬───────────────┘
                                    |
                    ┌───────────────┴───────────────┐
                    |                               |
                   NO                              YES
                    |                               |
                    v                               v
        ┌──────────────────────┐      ┌────────────────────────────┐
        │ NETWORK ISSUE        │      │ Network is OK              │
        │                      │      │ Problem is configuration   │
        │ Fix:                 │      └────────────┬───────────────┘
        │ • Check WiFi         │                   |
        │ • Check cellular     │                   v
        │ • Try different net  │      ┌────────────────────────────┐
        └──────────────────────┘      │ Run /diagnose-ios-         │
                                      │ connection.html            │
                                      └────────────┬───────────────┘
                                                   |
                                      ┌────────────┴───────────────┐
                                      |                            |
                            Health Test PASS                Health Test FAIL
                                      |                            |
                                      v                            v
                        ┌─────────────────────┐      ┌────────────────────────┐
                        │ JWT Test shows?     │      │ Edge Function not      │
                        └──────┬──────────────┘      │ responding             │
                               |                     │                        │
                    ┌──────────┴──────────┐          │ Fix:                   │
                    |                     |          │ 1. Check deployment    │
              JWT ENABLED          JWT DISABLED      │ 2. Check Supabase logs │
                    |                     |          │ 3. Verify project URL  │
                    v                     v          └────────────────────────┘
        ┌───────────────────┐ ┌────────────────────┐
        │ 🎯 THIS IS IT!    │ │ CORS or other      │
        │                   │ │ issue              │
        │ FIX:              │ │                    │
        │ 1. Open Supabase  │ │ Check:             │
        │    Dashboard      │ │ • CORS errors in   │
        │ 2. Edge Functions │ │   console          │
        │    → Settings     │ │ • SSL cert issues  │
        │ 3. Disable        │ │ • Firewall blocks  │
        │    "Verify JWT"   │ │ • ATS settings     │
        │ 4. Wait 10 sec    │ │                    │
        │ 5. Test again     │ │ See full guide:    │
        │                   │ │ /IOS_FAILED_TO_    │
        │ Guide:            │ │ FETCH_DIAGNOSTIC   │
        │ /SUPABASE_        │ │ .md                │
        │ DASHBOARD_STEPS   │ │                    │
        │ .md               │ │                    │
        └───────────────────┘ └────────────────────┘
                    |                     |
                    └──────────┬──────────┘
                               |
                               v
                    ┌──────────────────────┐
                    │ Test again           │
                    └──────────┬───────────┘
                               |
                    ┌──────────┴──────────┐
                    |                     |
                 WORKS                STILL FAILS
                    |                     |
                    v                     v
        ┌───────────────────┐ ┌─────────────────────┐
        │ ✅ SUCCESS!       │ │ Advanced debugging  │
        │                   │ │                     │
        │ Next steps:       │ │ 1. Check Supabase   │
        │ • Deploy to       │ │    function logs    │
        │   TestFlight      │ │ 2. Enable verbose   │
        │ • Test with real  │ │    iOS logging      │
        │   users           │ │ 3. Check iOS        │
        │ • Remember to     │ │    Console.app      │
        │   disable JWT     │ │ 4. Verify all       │
        │   after backend   │ │    headers sent     │
        │   updates!        │ │ 5. Contact support  │
        └───────────────────┘ └─────────────────────┘
```

---

## Quick Decision Tree

### 1. Is the device online?
```
Run in console: console.log('Online:', navigator.onLine)

✅ YES → Continue to #2
❌ NO → Fix network connection first
```

### 2. Can you reach Supabase directly?
```
In browser: https://ybrkbrrkcqpzpjnjdyib.supabase.co

✅ YES (shows some response) → Continue to #3
❌ NO (fails to load) → Network/DNS issue
```

### 3. Does health endpoint work?
```
Test: /diagnose-ios-connection.html → Click "Test Health"

✅ PASS (200 status) → Continue to #4
❌ FAIL (401 or error) → JWT verification is likely enabled → Go to FIX
```

### 4. Is JWT verification disabled?
```
Test: /diagnose-ios-connection.html → Click "Test JWT Verification"

✅ DISABLED → Continue to #5
❌ ENABLED → Go to FIX
```

### 5. Are there CORS errors?
```
Check iOS Safari Web Inspector console for red CORS messages

✅ NO CORS errors → Advanced debugging needed
❌ CORS errors → Check CORS configuration
```

---

## The Fix (for 90% of cases)

```
┌─────────────────────────────────────────────────────────┐
│  🎯 DISABLE JWT VERIFICATION                            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. https://supabase.com/dashboard                      │
│  2. Project: ybrkbrrkcqpzpjnjdyib                      │
│  3. Edge Functions → make-server-f116e23f               │
│  4. Settings tab                                        │
│  5. Toggle OFF: "Verify JWT"                            │
│  6. Wait 10 seconds                                     │
│  7. Test iOS app                                        │
│                                                         │
│  Full guide: /SUPABASE_DASHBOARD_STEPS.md              │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Common Scenarios

### Scenario A: First time deploying to iOS
**Symptom**: "Failed to fetch" on first launch  
**Likely cause**: JWT verification enabled  
**Fix**: Disable JWT in Supabase Dashboard  
**Guide**: `/QUICK_FIX_FAILED_TO_FETCH.md`

### Scenario B: Was working, now broken after backend update
**Symptom**: iOS app worked before, fails after code deployment  
**Likely cause**: JWT verification auto-enabled during deployment  
**Fix**: Disable JWT again (must do after every backend update)  
**Guide**: `/VERIFY_JWT_ISSUE.md` → Deployment Checklist

### Scenario C: Works in browser, fails on iOS
**Symptom**: Desktop browser works, iOS app fails  
**Likely causes**:
1. JWT verification enabled (most common)
2. CORS doesn't allow `capacitor://localhost` origin
3. iOS ATS blocking HTTP requests

**Fix order**:
1. Check JWT verification first
2. Run `/diagnose-ios-connection.html` on iOS
3. Check iOS Safari Web Inspector for specific errors

### Scenario D: Intermittent failures
**Symptom**: Sometimes works, sometimes fails  
**Likely causes**:
1. Token expiration
2. Session refresh issues
3. Network instability
4. Rate limiting

**Fix**: Check `/src/utils/api.ts` error logs for patterns

---

## Diagnostic Checklist

Run through these in order:

```
□ 1. Device is online (WiFi/cellular working)
□ 2. Can load https://supabase.com in Safari
□ 3. Health endpoint returns 200 (/diagnose-ios-connection.html)
□ 4. JWT verification is DISABLED in Supabase Dashboard
□ 5. No CORS errors in Safari Web Inspector console
□ 6. Authorization header is being sent (check Network tab)
□ 7. Supabase Edge Function logs show incoming requests
□ 8. iOS app has internet permissions (Info.plist)
```

**If all checked ✅**: Advanced issue → See `/IOS_FAILED_TO_FETCH_DIAGNOSTIC.md`

---

## Time to Fix

| Issue | Time to Fix | Difficulty |
|-------|-------------|------------|
| JWT verification enabled | 30 seconds | ⭐ Very Easy |
| CORS misconfiguration | 5 minutes | ⭐⭐ Easy |
| iOS ATS settings | 10 minutes | ⭐⭐ Easy |
| Network issues | Varies | ⭐⭐⭐ Medium |
| Advanced debugging | 30+ minutes | ⭐⭐⭐⭐ Hard |

---

## Emergency Quick Reference

```
┌────────────────────────────────────────────────────┐
│ MOST COMMON ISSUE (95% of cases):                 │
│                                                    │
│ ❌ "Verify JWT" is ENABLED in Supabase Dashboard  │
│                                                    │
│ ✅ Solution: DISABLE it                           │
│                                                    │
│ Where: Supabase Dashboard → Edge Functions →      │
│        make-server-f116e23f → Settings →          │
│        Toggle OFF "Verify JWT"                    │
│                                                    │
│ Takes: 30 seconds                                 │
│                                                    │
│ Full guide: /SUPABASE_DASHBOARD_STEPS.md         │
└────────────────────────────────────────────────────┘
```

---

## What to Check If Fix Doesn't Work

1. **Wait longer**: Settings can take 30 seconds to propagate
2. **Clear cache**: Hard refresh, clear browser cache
3. **Check logs**: `supabase functions logs make-server-f116e23f`
4. **Verify toggle**: Go back to Dashboard, confirm it's still OFF
5. **Test endpoint directly**: Use curl or Postman to test health endpoint
6. **Check iOS console**: Connect to Mac, use Safari Web Inspector
7. **Read logs**: Check for specific error messages in iOS Console.app

---

## Success Indicators

You'll know it's fixed when you see:

✅ Health endpoint: Status 200  
✅ Diagnostic tests: All pass  
✅ iOS app: Can connect and log in  
✅ Console: No "Failed to fetch" errors  
✅ Supabase logs: Show incoming requests  
✅ Network tab: Requests return 200, not 401  

---

## Related Documentation

- Quick fix: `/QUICK_FIX_FAILED_TO_FETCH.md`
- Dashboard guide: `/SUPABASE_DASHBOARD_STEPS.md`
- Full diagnostic: `/IOS_FAILED_TO_FETCH_DIAGNOSTIC.md`
- Test tool: `/diagnose-ios-connection.html`
- Summary: `/FIX_COMPLETE_SUMMARY.md`
