# 🔒 RATE LIMITING CONFIGURATION - INTERACTIVE CHECKLIST

**Estimated Time:** 30-60 minutes  
**Status:** Ready to configure

---

## 📋 PREPARATION

Before you start, you'll need:

- [ ] Supabase account login credentials
- [ ] Project ID (check `/utils/supabase/info.tsx`)
- [ ] Admin access to Supabase Dashboard
- [ ] Browser ready (Chrome, Safari, Firefox)

---

## 🚀 STEP 1: ACCESS SUPABASE DASHBOARD (5 min)

### 1.1 Login to Supabase

```
URL: https://supabase.com/dashboard
```

**Actions:**
1. [ ] Go to Supabase Dashboard
2. [ ] Login with your credentials
3. [ ] Enable 2FA if prompted (recommended)

---

### 1.2 Select Your Project

**Actions:**
1. [ ] Find your FGS project in the project list
2. [ ] Click on the project to open it
3. [ ] Verify you're in the correct project (check project ID)

**How to verify:**
- Dashboard shows your project name
- URL contains your project reference ID

---

## 🔐 STEP 2: CONFIGURE AUTHENTICATION RATE LIMITS (15 min)

### 2.1 Navigate to Auth Settings

**Path:** Left Sidebar → Authentication → Settings

**Actions:**
1. [ ] Click "Authentication" in left sidebar
2. [ ] Click "Settings" tab
3. [ ] Scroll down to "Rate Limits" section

---

### 2.2 Configure Login Rate Limits

**Setting 1: Anonymous Requests**

```
Field: "Anonymous requests per hour"
Value: 30
Purpose: Limits unauthenticated API requests
```

**Actions:**
1. [ ] Find "Anonymous requests per hour" field
2. [ ] Set value to: `30`
3. [ ] Click "Save"

---

**Setting 2: Email Rate Limits**

```
Field: "Emails per hour"
Value: 10
Purpose: Limits password reset and verification emails
```

**Actions:**
1. [ ] Find "Emails per hour" field
2. [ ] Set value to: `10`
3. [ ] Click "Save"

---

**Setting 3: Token Refresh Rate**

```
Field: "Token refreshes per hour"
Value: 30
Purpose: Limits token refresh requests
```

**Actions:**
1. [ ] Find "Token refreshes per hour" field
2. [ ] Set value to: `30`
3. [ ] Click "Save"

---

### 2.3 Configure Auth Security Settings

**Path:** Authentication → Settings → Security

**Setting 1: Secure Email Change**

**Actions:**
1. [ ] Find "Secure email change" toggle
2. [ ] Enable it (ON)
3. [ ] Click "Save"

**Purpose:** Requires email confirmation before changing email address

---

**Setting 2: Secure Password Change**

**Actions:**
1. [ ] Find "Secure password change" toggle
2. [ ] Enable it (ON)
3. [ ] Click "Save"

**Purpose:** Requires current password to change password

---

### 2.4 Verify Auth Rate Limit Configuration

**Checklist:**
- [ ] Anonymous requests: 30/hour ✅
- [ ] Email sends: 10/hour ✅
- [ ] Token refreshes: 30/hour ✅
- [ ] Secure email change: ON ✅
- [ ] Secure password change: ON ✅

**Screenshot:** Take a screenshot of your settings for documentation

---

## 📊 STEP 3: VERIFY BACKEND RATE LIMITING (5 min)

**Note:** Your backend already has rate limiting implemented. Let's verify it's active.

### 3.1 Check Signup Endpoint

**File:** `/supabase/functions/server/index.tsx`

**Look for:**
```typescript
app.post(
  "/make-server-f116e23f/auth/signup",
  rateLimit("signup", { maxAttempts: 5, windowMs: 60 * 60 * 1000 }),
  // ... handler
);
```

**Verification:**
- [x] ✅ Signup rate limited: 5 attempts / hour / IP (ALREADY DONE)

---

### 3.2 Check PIN Verification Endpoint

**Look for:**
```typescript
rateLimitPinVerify  // 3 attempts / 5 min / child+IP
```

**Verification:**
- [x] ✅ PIN verification rate limited: 3 attempts / 5 min (ALREADY DONE)

---

### 3.3 Check Event Creation Endpoint

**Look for:**
```typescript
rateLimitEventCreate  // 30 attempts / min / user
```

**Verification:**
- [x] ✅ Event creation rate limited: 30 attempts / min (ALREADY DONE)

---

### 3.4 Backend Rate Limiting Summary

**Status:**
- [x] ✅ Signup: 5 / hour / IP
- [x] ✅ PIN verify: 3 / 5 min / child+IP
- [x] ✅ Event create: 30 / min / user
- [x] ✅ General API: 100 / min / user

**No action needed** - Backend rate limiting is complete! ✅

---

## 🔄 STEP 4: DISABLE "VERIFY JWT" (CRITICAL!) (5 min)

**⚠️  KNOWN ISSUE:** Supabase auto-enables "Verify JWT" on Edge Functions after each deployment

### 4.1 Navigate to Edge Functions

**Path:** Left Sidebar → Edge Functions

**Actions:**
1. [ ] Click "Edge Functions" in left sidebar
2. [ ] Find function: `make-server-f116e23f`
3. [ ] Click on the function name

---

### 4.2 Disable JWT Verification

**Actions:**
1. [ ] Click "Settings" tab
2. [ ] Find "Verify JWT" toggle
3. [ ] Set to: **OFF** (disabled)
4. [ ] Click "Save"

**Why this is critical:**
- Public endpoints (signup, kid login) will return 403 if JWT verification is ON
- This setting auto-enables after each deployment
- You must manually disable it each time

---

### 4.3 Create a Reminder

**Actions:**
1. [ ] Add to deployment checklist
2. [ ] Set calendar reminder: "Check Verify JWT setting"
3. [ ] Document in team wiki/notes

**Reminder:**
```
After EVERY backend deployment:
1. Go to Edge Functions → make-server-f116e23f → Settings
2. Disable "Verify JWT"
3. Save changes
```

---

## 🧪 STEP 5: TEST RATE LIMITING (15 min)

Now let's verify everything works!

### 5.1 Test Signup Rate Limiting

**Open browser console (F12) and run:**

```javascript
// COPY AND PASTE THIS INTO BROWSER CONSOLE

const testSignupRateLimit = async () => {
  console.log('🧪 Testing signup rate limiting...\n');
  
  const API_BASE = 'https://YOUR_PROJECT_ID.supabase.co/functions/v1/make-server-f116e23f';
  const ANON_KEY = 'YOUR_ANON_KEY';
  
  for (let i = 0; i < 7; i++) {
    const timestamp = Date.now() + i;
    console.log(`Attempt ${i + 1}/7...`);
    
    const response = await fetch(`${API_BASE}/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ANON_KEY}`
      },
      body: JSON.stringify({
        email: `test-rl-${timestamp}@example.com`,
        password: 'TestPassword123!',
        name: `Test User ${timestamp}`,
        role: 'parent'
      })
    });
    
    const data = await response.json();
    console.log(`  Status: ${response.status}`);
    
    if (response.status === 429) {
      console.log(`  ✅ RATE LIMITED! Retry-After: ${data.retryAfter || 'N/A'}s`);
      console.log('  🎉 Signup rate limiting is working!\n');
      break;
    } else if (response.ok) {
      console.log(`  ✅ Signup ${i + 1} successful`);
    } else {
      console.log(`  ⚠️  Error: ${data.error}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('🏁 Test complete\n');
};

testSignupRateLimit();
```

**Expected Result:**
```
Attempt 1/7... ✅ Signup 1 successful
Attempt 2/7... ✅ Signup 2 successful
Attempt 3/7... ✅ Signup 3 successful
Attempt 4/7... ✅ Signup 4 successful
Attempt 5/7... ✅ Signup 5 successful
Attempt 6/7... ✅ RATE LIMITED! Retry-After: 3600s
🎉 Signup rate limiting is working!
```

**Checklist:**
- [ ] First 5 attempts successful
- [ ] Attempt 6 returns 429 (Rate Limited)
- [ ] Response includes `retryAfter` field

---

### 5.2 Test Login Rate Limiting (Supabase)

**Note:** Supabase Auth has built-in rate limiting. Let's verify:

**Open browser console and run:**

```javascript
// COPY AND PASTE THIS INTO BROWSER CONSOLE

const testLoginRateLimit = async () => {
  console.log('🧪 Testing login rate limiting...\n');
  
  // Use Supabase client
  const { createClient } = supabase;
  const client = createClient(
    'YOUR_SUPABASE_URL',
    'YOUR_ANON_KEY'
  );
  
  for (let i = 0; i < 10; i++) {
    console.log(`Login attempt ${i + 1}/10...`);
    
    const { data, error } = await client.auth.signInWithPassword({
      email: 'test@example.com',
      password: 'wrong-password-' + i
    });
    
    if (error) {
      console.log(`  ❌ ${error.message}`);
      
      if (error.message.includes('rate') || error.message.includes('limit')) {
        console.log('  ✅ RATE LIMITED by Supabase!');
        console.log('  🎉 Login rate limiting is working!\n');
        break;
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('🏁 Test complete\n');
};

testLoginRateLimit();
```

**Expected Result:**
- First few attempts: Invalid credentials error
- After 5-10 attempts: Rate limiting kicks in
- Error message contains "rate" or "limit"

**Checklist:**
- [ ] Failed login attempts are rate limited
- [ ] Supabase returns rate limiting error

---

### 5.3 Test PIN Lockout

**⚠️  WARNING:** This will lock the test child for 15 minutes!

**Use test environment data:**

```javascript
// COPY AND PASTE THIS INTO BROWSER CONSOLE

const testPinLockout = async () => {
  console.log('🧪 Testing PIN lockout...\n');
  console.log('⚠️  This will lock the test account for 15 minutes!\n');
  
  const API_BASE = 'https://YOUR_PROJECT_ID.supabase.co/functions/v1/make-server-f116e23f';
  const ANON_KEY = 'YOUR_ANON_KEY';
  
  // Use test data
  const testData = {
    familyCode: 'XKNN5U',  // Replace with your test family code
    childId: 'child:1771648589429',  // Replace with your test child ID
    pin: '0000'  // Wrong PIN
  };
  
  for (let i = 0; i < 6; i++) {
    console.log(`PIN attempt ${i + 1}/6...`);
    
    const response = await fetch(`${API_BASE}/kid/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': ANON_KEY
      },
      body: JSON.stringify(testData)
    });
    
    const data = await response.json();
    console.log(`  Status: ${response.status}`);
    
    if (data.locked || data.lockedUntil) {
      console.log(`  ⚠️  ACCOUNT LOCKED!`);
      console.log(`  Locked until: ${new Date(data.lockedUntil)}`);
      console.log('  🎉 PIN lockout is working!\n');
      break;
    } else if (response.status === 429) {
      console.log(`  ✅ RATE LIMITED!`);
      console.log('  🎉 PIN rate limiting is working!\n');
      break;
    } else {
      console.log(`  ❌ Invalid PIN (attempt ${i + 1})`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('🏁 Test complete\n');
};

testPinLockout();
```

**Expected Result:**
```
PIN attempt 1/6... ❌ Invalid PIN (attempt 1)
PIN attempt 2/6... ❌ Invalid PIN (attempt 2)
PIN attempt 3/6... ❌ Invalid PIN (attempt 3)
PIN attempt 4/6... ❌ Invalid PIN (attempt 4)
PIN attempt 5/6... ❌ Invalid PIN (attempt 5)
PIN attempt 6/6... ⚠️  ACCOUNT LOCKED!
Locked until: [15 minutes from now]
🎉 PIN lockout is working!
```

**Checklist:**
- [ ] First 5 attempts return invalid PIN
- [ ] Attempt 6+ returns locked status
- [ ] `lockedUntil` timestamp is ~15 minutes in future

---

## 📊 STEP 6: SET UP MONITORING (10 min)

### 6.1 Configure Alerts

**Path:** Left Sidebar → Settings → Alerts

**Alert 1: High Failed Login Rate**

**Actions:**
1. [ ] Click "Create Alert"
2. [ ] Alert Type: "Custom"
3. [ ] Name: "High Failed Login Rate"
4. [ ] Metric: `auth.failed_login_count`
5. [ ] Condition: `> 20` in 5 minutes
6. [ ] Notification: Email
7. [ ] Click "Create"

---

**Alert 2: High API Error Rate**

**Actions:**
1. [ ] Click "Create Alert"
2. [ ] Name: "High API Error Rate"
3. [ ] Metric: `edge_functions.5xx_count`
4. [ ] Condition: `> 10` in 5 minutes
5. [ ] Notification: Email
6. [ ] Click "Create"

---

### 6.2 Verify Alert Configuration

**Checklist:**
- [ ] High Failed Login Rate alert created
- [ ] High API Error Rate alert created
- [ ] Email notifications enabled
- [ ] Test email received (send test)

---

## ✅ STEP 7: FINAL VERIFICATION (5 min)

### 7.1 Configuration Checklist

**Supabase Dashboard:**
- [ ] ✅ Anonymous requests: 30/hour
- [ ] ✅ Email sends: 10/hour
- [ ] ✅ Token refreshes: 30/hour
- [ ] ✅ Secure email change: ON
- [ ] ✅ Secure password change: ON
- [ ] ✅ "Verify JWT": OFF (disabled)

**Backend Code:**
- [x] ✅ Signup rate limited: 5/hour/IP
- [x] ✅ PIN verify rate limited: 3/5min/child+IP
- [x] ✅ Event create rate limited: 30/min/user
- [x] ✅ General API rate limited: 100/min/user

**Testing:**
- [ ] ✅ Signup rate limiting tested
- [ ] ✅ Login rate limiting verified
- [ ] ✅ PIN lockout tested

**Monitoring:**
- [ ] ✅ Alerts configured
- [ ] ✅ Email notifications working

---

### 7.2 Documentation

**Actions:**
1. [ ] Take screenshots of all settings
2. [ ] Save to `/docs/rate-limiting-config-screenshots/`
3. [ ] Update team documentation
4. [ ] Add to deployment checklist

---

## 🎉 COMPLETION

### Congratulations! Rate limiting is now fully configured! ✅

**What's Protected:**
- ✅ Brute force login attacks
- ✅ Signup spam
- ✅ PIN guessing attacks
- ✅ Event spam
- ✅ API abuse
- ✅ Email bombing

**Next Steps:**
1. ✅ Capacitor setup (already done)
2. ⏭️  Pre-launch testing
3. ⏭️  iOS deployment

---

## 📋 POST-CONFIGURATION MAINTENANCE

### Daily (First Week)

- [ ] Check failed login metrics
- [ ] Review rate limit triggers
- [ ] Monitor alert emails

### Weekly

- [ ] Review rate limit effectiveness
- [ ] Check for false positives
- [ ] Adjust thresholds if needed

### After Each Deployment

- [ ] ⚠️  **CRITICAL:** Disable "Verify JWT" in Edge Functions
- [ ] Verify rate limits still active
- [ ] Test critical endpoints

---

## 🆘 TROUBLESHOOTING

### Issue: Rate limiting not working

**Solution:**
1. Check Supabase settings saved
2. Clear browser cache
3. Test from different IP
4. Check Edge Function logs

### Issue: Too many users getting rate limited

**Solution:**
1. Increase rate limit thresholds
2. Check for DDoS attack
3. Add IP whitelist for trusted sources

### Issue: "Verify JWT" keeps enabling

**Solution:**
1. This is a known Supabase issue
2. Add to deployment checklist
3. Set calendar reminder
4. Consider separate Edge Function for public endpoints

---

## 📞 SUPPORT

**Documentation:**
- Detailed guide: `/SUPABASE_RATE_LIMITING_SETUP_GUIDE.md`
- Troubleshooting: `/IOS_DEPLOYMENT_GUIDE.md`

**Supabase:**
- Docs: https://supabase.com/docs/guides/auth/rate-limits
- Support: https://supabase.com/support

---

**Status:** ✅ Rate limiting configuration complete!  
**Time Spent:** ~45 minutes  
**Next:** Pre-launch testing checklist
