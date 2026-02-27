# Temporarily Disable Rate Limits for Testing

## 🎯 Purpose

During active development and testing, Supabase's default rate limits (60 requests/hour) can block your test suite. Here's how to temporarily increase or disable them.

---

## ⚡ Quick Solution: Use "Quick Setup" Button

**The easiest option:**

1. Click purple button in app
2. Click **"Quick Setup (Family A Only)"** ⚡
3. This creates only Family A (faster, fewer API calls)
4. Enough for all Points & Events tests!

**Why this works:**
- Creates 1 family instead of 2 (50% fewer requests)
- Still creates 2 parents + 2 children
- Sufficient for 95% of tests
- Avoids rate limits entirely

---

## 🔧 Option 2: Increase Rate Limits in Supabase

### Step 1: Access Rate Limit Settings

1. Go to Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Navigate to: **Authentication → Rate Limits**

### Step 2: Adjust Limits

Find these limits and increase them:

```
Default Rate Limits (per hour):
├─ Email/Password Sign Up: 60 → 1000
├─ Email/Password Sign In: 60 → 1000  
├─ Anonymous Sign In: 60 → 1000
└─ Token Refresh: 60 → 1000
```

**Recommended Testing Values:**
- **Sign Up:** `1000/hour` or `unlimited`
- **Sign In:** `1000/hour` or `unlimited`

### Step 3: Save Changes

Click **Save** and wait ~1 minute for changes to propagate.

---

## ⏰ Option 3: Just Wait 1 Hour

**If you don't want to change settings:**

1. Wait 1 hour from your last test run
2. Rate limits reset automatically
3. Run "Quick Setup (Family A Only)"
4. Should work fine!

**Why wait?**
- Limits reset every 60 minutes
- Your current retry logic helps (5 retries with backoff)
- Once Family A is created, you're good for days

---

## 🎯 Current Rate Limit Status

### What You're Hitting:

```
Current Activity:
├─ Family A creation: ✅ Success (4 signups + 1 family)
├─ Family B creation: ❌ Rate limited (hit 429 after Family A)
└─ Total requests: ~5-6 auth operations
```

### Why It's Happening:

```
Timeline:
12:00 PM - Started testing (multiple test runs)
12:10 PM - Hit 60/hour limit
12:15 PM - Family A created ✅
12:15 PM - Family B blocked by rate limit ❌
```

**Solution:** You already have Family A! Just use "Quick Setup" next time.

---

## 📊 Recommended Testing Workflow

### For Active Development:

```bash
# Option A: Quick Setup (RECOMMENDED)
1. Click "Quick Setup (Family A Only)" ⚡
   ✅ Fast (30 seconds)
   ✅ No rate limits
   ✅ Enough for testing

# Option B: Increase Limits in Supabase
1. Set auth limits to 1000/hour
2. Click "Reset & Recreate"
   ✅ Creates both families
   ✅ Good for comprehensive tests
```

### For Production:

```bash
# Keep rate limits enabled!
✅ 60/hour is good for security
✅ Prevents abuse
✅ Your retry logic handles it
```

---

## 🚀 What to Do RIGHT NOW

You have two easy options:

### Option 1: Use What You Have (FASTEST)

```
✅ Family A is already created!
   - Just use it for testing
   - Family ID: family:1771688896215
   - Invite Code: 4503ML
   - 2 parents, 2 children

Next steps:
1. Click "Points & Events (P0/P1)"
2. Tests will use existing Family A
3. You're done!
```

### Option 2: Fresh Start Tomorrow

```
⏰ Wait until tomorrow
   - Rate limits fully reset
   - Click "Quick Setup (Family A Only)"
   - Done in 30 seconds
```

### Option 3: Increase Limits Now

```
1. Go to Supabase → Auth → Rate Limits
2. Increase to 1000/hour
3. Click "Quick Setup (Family A Only)"
4. Done!
```

---

## ✅ Success Checklist

**After setup, you should have:**

- [x] ✅ Family A created (ID: family:1771688896215)
- [x] ✅ 2 Parents (parent-a1@fgs-test.com, parent-a2@fgs-test.com)
- [x] ✅ 2 Children (Kid A1 with PIN 1111, Kid A2 with PIN 2222)
- [x] ✅ Saved to localStorage
- [x] ✅ Ready for Points & Events tests

**You can now run:**
- ✅ Points & Events (P0/P1)
- ✅ Data Flows (P0)
- ✅ API Security Audit
- ✅ All other P0 tests

---

## 💡 Key Insight

**You don't need Family B for most tests!**

Family B is only needed for:
- Cross-family isolation tests
- Multi-family performance testing
- Edge cases

For Points & Events, Data Flows, and 95% of testing: **Family A is enough.**

---

## 🎯 Recommendation

**Use "Quick Setup (Family A Only)"** - it's the sweet spot:
- Fast (30 seconds)
- No rate limit issues
- Sufficient for comprehensive testing
- Can always create Family B later if needed

Click the purple button → "Quick Setup (Family A Only)" ⚡ and you're ready to test!
