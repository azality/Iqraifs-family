# 🧪 MANUAL TEST SCRIPTS FOR AUTH-P0.6 & AUTH-P0.7

These tests cannot be automated but are critical for production readiness.

---

## 📋 AUTH-P0.6: Kid PIN Lockout Testing

**Objective:** Verify that 5 failed PIN attempts trigger a 15-minute lockout

### Prerequisites
```
✅ Test family created with at least 1 kid
✅ Kid has known PIN (e.g., 1111)
✅ Timer/stopwatch available
✅ Notepad for recording attempts
```

### Test Steps

#### Part 1: Failed Attempts & Lockout

1. **Setup**
   ```
   - Navigate to /kid/login
   - Enter valid family code
   - Select test kid
   ```

2. **Attempt 1-5: Wrong PIN**
   ```
   Time: [Record timestamp]
   Enter: 0000 (wrong PIN)
   Expected: "Invalid PIN" error
   Actual: _____________________
   ```
   
   Repeat 4 more times (total 5 failed attempts)
   
   ```
   Attempt 2 at: _____
   Attempt 3 at: _____
   Attempt 4 at: _____
   Attempt 5 at: _____
   ```

3. **Attempt 6: Should trigger lockout**
   ```
   Enter: 0000 (wrong PIN again)
   Expected: Lockout message "Too many attempts. Try again in X minutes"
   Actual: _____________________
   ```

4. **Attempt 7: Verify lockout persists**
   ```
   Enter: 1111 (CORRECT PIN)
   Expected: Still locked out (correct PIN rejected)
   Actual: _____________________
   ```

#### Part 2: Lockout Window Expiry

5. **Wait for lockout window to expire**
   ```
   Lockout time: 15 minutes
   Start time: _____
   End time:   _____
   
   [Set timer for 15 minutes + 1 minute buffer]
   ```

6. **Attempt after window expires**
   ```
   After 16 minutes from lockout:
   Enter: 1111 (correct PIN)
   Expected: Login succeeds
   Actual: _____________________
   ```

### Expected Results

✅ **PASS Criteria:**
- Attempts 1-5: Error message, no lockout
- Attempt 6: Lockout triggered
- Attempt 7: Correct PIN rejected during lockout
- After 15min: Correct PIN accepted

❌ **FAIL Criteria:**
- No lockout after 5+ attempts
- Lockout doesn't expire after 15 minutes
- Correct PIN works during lockout

### Notes
```
Test Date: _____________________
Tester: _____________________
Device: _____________________
Result: PASS / FAIL
Issues: _____________________
```

---

## ⏱️  AUTH-P0.7: Session Expiry Testing

### Part A: Parent Session Auto-Refresh

**Objective:** Verify parent session refreshes automatically within 30-minute window

#### Prerequisites
```
✅ Parent account with active session
✅ Timer/stopwatch
✅ Patience (30+ minutes)
```

#### Test Steps

1. **Login as parent**
   ```
   Email: _____________________
   Password: _____________________
   Login time: _____________________
   ```

2. **Use app normally for 25 minutes**
   ```
   Perform actions every 5 minutes:
   - Minute 5:  Navigate to /settings
   - Minute 10: Navigate to /log
   - Minute 15: Navigate to /review
   - Minute 20: Navigate to /rewards
   - Minute 25: Navigate to /
   ```

3. **Check at 28 minutes (before 30min expiry)**
   ```
   Action: Make API call (e.g., refresh dashboard)
   Expected: No login prompt, session auto-refreshed
   Actual: _____________________
   ```

4. **Simulate longer inactivity (if possible)**
   ```
   Option A: Wait 35 minutes without interaction
   Option B: Manually expire token in browser DevTools
   
   After expiry:
   Action: Try to navigate or make API call
   Expected: Either auto-refresh or graceful redirect to login
   Actual: _____________________
   ```

#### Expected Results

✅ **PASS Criteria:**
- No login prompts during normal 30min usage
- Session refreshes automatically in background
- After 30min+ inactivity: Redirect to login (no errors)

❌ **FAIL Criteria:**
- User prompted to login before 30 minutes
- Session expires causing errors/crashes
- Infinite redirect loop

---

### Part B: Kid Session 7-Day TTL & Expiry Redirect

**Objective:** Verify kid session lasts 7 days and redirects gracefully on expiry

#### Prerequisites
```
⚠️  WARNING: This test requires either:
   A) Waiting 7 days (not practical)
   B) Creating a test endpoint with short-lived tokens
   C) Manual token manipulation in browser
```

#### Option 1: Quick Test (Token Manipulation)

1. **Login as kid**
   ```
   Family Code: _____________________
   Kid Name: _____________________
   PIN: _____________________
   Login time: _____________________
   ```

2. **Open Browser DevTools → Application → Local Storage**
   ```
   Find key: kid_access_token
   Current value: _____________________
   
   Replace with: "EXPIRED_TOKEN_123"
   Save changes
   ```

3. **Try to navigate to /kid/home**
   ```
   Expected: Redirect to /kid/login
   Expected: No error messages
   Expected: No infinite loop
   Actual: _____________________
   ```

4. **Try to make API call**
   ```
   Action: Refresh kid dashboard
   Expected: 401 Unauthorized
   Expected: Token cleared from localStorage
   Expected: Redirect to /kid/login
   Actual: _____________________
   ```

#### Option 2: Long Test (7-Day Wait)

1. **Login as kid and note timestamp**
   ```
   Login date: _____________________
   Expiry date: _____________________ (7 days later)
   ```

2. **DO NOT logout or clear storage**
   ```
   Leave browser tab open (if possible)
   OR close browser but don't clear data
   ```

3. **Return after 7+ days**
   ```
   Action: Try to access /kid/home
   Expected: Session expired, redirect to /kid/login
   Actual: _____________________
   ```

#### Expected Results

✅ **PASS Criteria:**
- Kid can use app freely within 7 days
- After 7 days: Clean redirect to /kid/login
- No error messages during expiry
- No infinite redirect loops
- Token cleared from localStorage after expiry

❌ **FAIL Criteria:**
- Session expires before 7 days
- Errors/crashes on expiry
- Infinite redirect loop
- Token not cleared after expiry

---

## 🔬 Advanced Testing (Optional)

### Test: Parent vs Kid Session Isolation

**Objective:** Verify session expiry in one mode doesn't affect the other

1. **Setup dual session**
   ```
   - Login as parent (Device A or Browser 1)
   - Login as kid (Device B or Browser 2 Incognito)
   ```

2. **Expire kid session**
   ```
   Method: Token manipulation or wait 7 days
   Result on kid device: _____________________
   ```

3. **Check parent session**
   ```
   Navigate to parent dashboard
   Expected: Parent session unaffected
   Actual: _____________________
   ```

4. **Expire parent session**
   ```
   Method: Wait 30+ min or manipulate token
   Result on parent device: _____________________
   ```

5. **Check kid session (if not already expired)**
   ```
   Navigate to kid dashboard
   Expected: Kid session unaffected
   Actual: _____________________
   ```

---

## 📊 Test Results Summary

| Test Case | Date | Tester | Result | Notes |
|-----------|------|--------|--------|-------|
| AUTH-P0.6: PIN Lockout | | | PASS/FAIL | |
| AUTH-P0.7A: Parent Auto-Refresh | | | PASS/FAIL | |
| AUTH-P0.7B: Kid 7-Day TTL | | | PASS/FAIL | |
| Advanced: Session Isolation | | | PASS/FAIL | |

---

## 🐛 Issue Reporting Template

If any test fails, use this template:

```
**Test Case:** AUTH-P0.X
**Date:** _____________________
**Tester:** _____________________
**Device/Browser:** _____________________

**Expected Behavior:**
_____________________

**Actual Behavior:**
_____________________

**Steps to Reproduce:**
1. _____________________
2. _____________________
3. _____________________

**Screenshots/Logs:**
[Attach console logs or screenshots]

**Severity:** Critical / High / Medium / Low

**Impact:**
_____________________
```

---

## 💡 Testing Tips

### For PIN Lockout Testing:
- ✅ Use a dedicated test kid (not production data)
- ✅ Have family code written down (not in clipboard)
- ✅ Use actual timer for accurate 15-minute tracking
- ✅ Test both "wrong PIN" and "correct PIN during lockout"

### For Session Expiry Testing:
- ✅ Parent testing: Best done during work session (use app naturally)
- ✅ Kid testing: Use token manipulation for quick results
- ✅ Check browser console for token refresh logs
- ✅ Verify localStorage keys cleared after expiry
- ✅ Test on actual iOS device (not just browser)

### General:
- 📝 Record exact timestamps for all actions
- 🖼️  Take screenshots of error messages
- 📋 Save browser console logs
- 🔄 Test on multiple browsers/devices if possible
- ✅ Retest after any auth-related code changes

---

## 🎯 Production Readiness Checklist

Before iOS launch, these tests MUST pass:

- [ ] AUTH-P0.6: PIN lockout works correctly
- [ ] AUTH-P0.7A: Parent session auto-refreshes
- [ ] AUTH-P0.7B: Kid session expires at 7 days
- [ ] No infinite redirect loops
- [ ] No error messages visible to users
- [ ] localStorage cleaned up properly
- [ ] Tested on physical iOS devices
- [ ] Tested with poor network conditions

---

**Next Steps After Testing:**
1. Document all results
2. Fix any failures
3. Retest after fixes
4. Update audit documentation
5. Mark AUTH-P0.6 and AUTH-P0.7 as PASSED

**Questions?** Refer back to `/COMPREHENSIVE_AUTH_AUDIT_SUMMARY.md`
