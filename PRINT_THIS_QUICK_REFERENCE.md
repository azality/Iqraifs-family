# 📋 QUICK REFERENCE CARD - Print This! ✂️

---

```
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║  🚨 iOS "FAILED TO FETCH" - EMERGENCY FIX                        ║
║                                                                   ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  PROBLEM:  iOS app can't connect to backend                      ║
║  CAUSE:    "Verify JWT" enabled in Supabase                      ║
║  FIX:      Disable it (takes 30 seconds)                         ║
║                                                                   ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  🔧 THE FIX (7 STEPS):                                           ║
║                                                                   ║
║  1️⃣  Open: https://supabase.com/dashboard                        ║
║                                                                   ║
║  2️⃣  Select project: ybrkbrrkcqpzpjnjdyib                        ║
║                                                                   ║
║  3️⃣  Click: Edge Functions (left sidebar)                        ║
║                                                                   ║
║  4️⃣  Click: make-server-f116e23f                                 ║
║                                                                   ║
║  5️⃣  Click: Settings tab (top)                                   ║
║                                                                   ║
║  6️⃣  Find: "Verify JWT" toggle → Turn OFF                        ║
║                                                                   ║
║  7️⃣  Wait: 10 seconds → Test iOS app                             ║
║                                                                   ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  ✅ TEST IF IT WORKED:                                           ║
║                                                                   ║
║  Option A: Open /diagnose-ios-connection.html                    ║
║           Click "Run All Tests"                                  ║
║           Look for green checkmarks ✅                            ║
║                                                                   ║
║  Option B: Test health endpoint in browser:                      ║
║           ybrkbrrkcqpzpjnjdyib.supabase.co/                     ║
║           functions/v1/make-server-f116e23f/health               ║
║           Should return: { "status": "healthy" }                 ║
║                                                                   ║
║  Option C: Just try your iOS app - should work! 🎉               ║
║                                                                   ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  ⚠️  IMPORTANT: AFTER EVERY BACKEND UPDATE                       ║
║                                                                   ║
║  JWT verification AUTO-ENABLES on deployment!                    ║
║                                                                   ║
║  Your deployment checklist:                                      ║
║  ☐ Deploy backend code                                          ║
║  ☐ Wait 30 seconds                                               ║
║  ☐ Open Supabase Dashboard                                       ║
║  ☐ Disable "Verify JWT" (follow steps above)                     ║
║  ☐ Test iOS app                                                  ║
║                                                                   ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  📚 DOCUMENTATION FILES:                                         ║
║                                                                   ║
║  Quick fix:  /QUICK_FIX_FAILED_TO_FETCH.md                      ║
║  Visual:     /SUPABASE_DASHBOARD_STEPS.md                       ║
║  Full guide: /IOS_FAILED_TO_FETCH_DIAGNOSTIC.md                 ║
║  Flowchart:  /TROUBLESHOOTING_FLOWCHART.md                      ║
║  Index:      /START_HERE_FIX_iOS.md                             ║
║                                                                   ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  🆘 TROUBLESHOOTING:                                             ║
║                                                                   ║
║  Still getting errors?                                           ║
║  → Wait 30 seconds (settings take time)                          ║
║  → Clear browser cache                                           ║
║  → Check Supabase Dashboard (toggle still OFF?)                  ║
║  → Run /diagnose-ios-connection.html                            ║
║  → See /TROUBLESHOOTING_FLOWCHART.md                            ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
```

---

## ✂️ Cut Here - Keep This at Your Desk ✂️

---

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  DEPLOYMENT CHECKLIST - Backend Updates          ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃                                                   ┃
┃  ☐ 1. Make code changes                          ┃
┃  ☐ 2. Test locally                               ┃
┃  ☐ 3. Deploy to Supabase                         ┃
┃  ☐ 4. Wait 30 seconds                            ┃
┃  ☐ 5. Open Supabase Dashboard                    ┃
┃  ☐ 6. Edge Functions → make-server-f116e23f      ┃
┃  ☐ 7. Settings → Disable "Verify JWT"            ┃
┃  ☐ 8. Wait 10 seconds                            ┃
┃  ☐ 9. Test health endpoint                       ┃
┃  ☐ 10. Test iOS app                              ┃
┃                                                   ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

---

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  QUICK TEST COMMANDS                              ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃                                                   ┃
┃  Health Check (Browser):                         ┃
┃  https://ybrkbrrkcqpzpjnjdyib.supabase.co/       ┃
┃  functions/v1/make-server-f116e23f/health        ┃
┃                                                   ┃
┃  Health Check (Terminal):                        ┃
┃  curl https://ybrkbrrkcqpzpjnjdyib.supabase.co/  ┃
┃  functions/v1/make-server-f116e23f/health \      ┃
┃  -H "apikey: YOUR_ANON_KEY"                      ┃
┃                                                   ┃
┃  View Logs:                                      ┃
┃  supabase functions logs make-server-f116e23f    ┃
┃  --project-ref ybrkbrrkcqpzpjnjdyib             ┃
┃                                                   ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

---

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  SUCCESS INDICATORS                               ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃                                                   ┃
┃  ✅ Health endpoint returns 200                  ┃
┃  ✅ Returns: { "status": "healthy", ... }        ┃
┃  ✅ iOS app connects without errors              ┃
┃  ✅ Login works                                  ┃
┃  ✅ No "Failed to fetch" errors                  ┃
┃  ✅ Logs appear in Supabase console              ┃
┃  ✅ Diagnostic tests all pass                    ┃
┃                                                   ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

---

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  COMMON MISTAKES TO AVOID                         ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃                                                   ┃
┃  ❌ Thinking it's a CORS issue                   ┃
┃     (CORS is fine - it's JWT verification)       ┃
┃                                                   ┃
┃  ❌ Trying to fix it with code                   ┃
┃     (Must be done in Dashboard - can't code it)  ┃
┃                                                   ┃
┃  ❌ Forgetting to disable after deployments      ┃
┃     (It auto-enables EVERY time)                 ┃
┃                                                   ┃
┃  ❌ Not waiting long enough                      ┃
┃     (Settings take 10-30 seconds to propagate)   ┃
┃                                                   ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

---

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  EMERGENCY CONTACTS                               ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃                                                   ┃
┃  Supabase Dashboard:                             ┃
┃  https://supabase.com/dashboard                  ┃
┃                                                   ┃
┃  Project ID:                                     ┃
┃  ybrkbrrkcqpzpjnjdyib                           ┃
┃                                                   ┃
┃  Edge Function:                                  ┃
┃  make-server-f116e23f                            ┃
┃                                                   ┃
┃  Documentation:                                  ┃
┃  /START_HERE_FIX_iOS.md                         ┃
┃                                                   ┃
┃  Diagnostic Tool:                                ┃
┃  /diagnose-ios-connection.html                  ┃
┃                                                   ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

---

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  BOOKMARK THESE URLS                              ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃                                                   ┃
┃  Supabase Dashboard Settings:                    ┃
┃  https://supabase.com/dashboard/project/         ┃
┃  ybrkbrrkcqpzpjnjdyib/functions/                ┃
┃  make-server-f116e23f/settings                   ┃
┃                                                   ┃
┃  Health Check:                                   ┃
┃  https://ybrkbrrkcqpzpjnjdyib.supabase.co/       ┃
┃  functions/v1/make-server-f116e23f/health        ┃
┃                                                   ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

---

## 💡 Pro Tips

1. **Bookmark the Supabase Dashboard settings page** - you'll visit it often
2. **Keep this card visible** at your desk during development
3. **Add "Disable JWT" to your muscle memory** - it should be automatic after deployments
4. **Test immediately after disabling** - don't assume it worked
5. **Use the diagnostic tool** (`/diagnose-ios-connection.html`) to confirm

---

## 📞 When to Use Each Doc

| Situation | Use This File |
|-----------|---------------|
| Need fix NOW | `/QUICK_FIX_FAILED_TO_FETCH.md` |
| Need visual guide | `/SUPABASE_DASHBOARD_STEPS.md` |
| Need to test | `/diagnose-ios-connection.html` |
| Need flowchart | `/TROUBLESHOOTING_FLOWCHART.md` |
| Need full details | `/IOS_FAILED_TO_FETCH_DIAGNOSTIC.md` |
| Need overview | `/START_HERE_FIX_iOS.md` |
| This is my first time | `/START_HERE_FIX_iOS.md` |

---

## ✂️ Scissors Line - Keep This Handy! ✂️

**Tip**: Print this page, cut along the scissors lines, and tape the cards to your monitor or desk!

---

**Last Updated**: February 26, 2026  
**Version**: 1.0  
**Status**: ✅ Ready to use
