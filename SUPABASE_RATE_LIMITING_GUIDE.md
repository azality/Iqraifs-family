# 🔒 SUPABASE RATE LIMITING CONFIGURATION GUIDE

**Goal:** Configure Supabase to prevent brute-force attacks on authentication endpoints

**Required For:** AUTH-P0.3 compliance (5 failed login attempts / 15 minutes)

---

## 📋 Overview

Supabase provides two levels of rate limiting:
1. **Auth Rate Limits** (recommended) - Built into Supabase Auth
2. **Edge Function Rate Limits** (custom) - For your backend endpoints

For AUTH-P0.3, we need **both**.

---

## 🎯 Method 1: Supabase Dashboard (Recommended)

### Step 1: Access Supabase Dashboard

```
1. Go to: https://supabase.com/dashboard
2. Login to your account
3. Select your project: [Your Project Name]
```

### Step 2: Configure Auth Rate Limits

#### Option A: Via Dashboard UI (If Available)

```
1. Navigate to: Authentication → Settings → Rate Limits
   OR
   Settings → API Settings → Rate Limits

2. Look for section: "Auth Endpoint Rate Limits"

3. Configure these limits:
   ┌─────────────────────────────────────────┐
   │ Endpoint: /auth/v1/token                │
   │ (Email/Password Login)                   │
   │                                          │
   │ Max Requests: 5                          │
   │ Time Window:  15 minutes                 │
   │ Per:          IP Address                 │
   └─────────────────────────────────────────┘

4. Click "Save" or "Update"
```

#### Option B: Via Database Policy (Advanced)

If Dashboard doesn't have UI for rate limits, configure via SQL:

```sql
-- Create rate limiting table (if not exists)
CREATE TABLE IF NOT EXISTS auth.rate_limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    identifier TEXT NOT NULL, -- IP address or email
    endpoint TEXT NOT NULL,
    attempts INT DEFAULT 0,
    window_start TIMESTAMP DEFAULT NOW(),
    locked_until TIMESTAMP,
    UNIQUE(identifier, endpoint)
);

-- Create function to check rate limit
CREATE OR REPLACE FUNCTION auth.check_rate_limit(
    p_identifier TEXT,
    p_endpoint TEXT,
    p_max_attempts INT DEFAULT 5,
    p_window_minutes INT DEFAULT 15
)
RETURNS BOOLEAN AS $$
DECLARE
    v_record RECORD;
    v_now TIMESTAMP := NOW();
BEGIN
    -- Get or create rate limit record
    SELECT * INTO v_record
    FROM auth.rate_limits
    WHERE identifier = p_identifier
      AND endpoint = p_endpoint;
    
    -- Check if locked
    IF v_record.locked_until IS NOT NULL AND v_record.locked_until > v_now THEN
        RETURN FALSE; -- Still locked
    END IF;
    
    -- Check if window expired (reset counter)
    IF v_record.window_start IS NULL OR 
       (v_now - v_record.window_start) > INTERVAL '1 minute' * p_window_minutes THEN
        -- Reset window
        UPDATE auth.rate_limits
        SET attempts = 1, window_start = v_now, locked_until = NULL
        WHERE identifier = p_identifier AND endpoint = p_endpoint;
        RETURN TRUE;
    END IF;
    
    -- Increment attempts
    UPDATE auth.rate_limits
    SET attempts = attempts + 1
    WHERE identifier = p_identifier AND endpoint = p_endpoint;
    
    -- Check if exceeded
    IF v_record.attempts + 1 >= p_max_attempts THEN
        UPDATE auth.rate_limits
        SET locked_until = v_now + INTERVAL '1 minute' * p_window_minutes
        WHERE identifier = p_identifier AND endpoint = p_endpoint;
        RETURN FALSE;
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**⚠️ Note:** This approach requires Supabase Pro or Enterprise for custom auth hooks.

---

## 🎯 Method 2: Backend Rate Limiting (Works Now)

Since you control the backend, implement rate limiting in your Edge Functions.

### Step 1: Update Backend Auth Endpoint

Open `/supabase/functions/server/auth.ts` and add rate limiting:

```typescript
import * as kv from './kv_store';

// Rate limiting configuration
const RATE_LIMIT = {
  MAX_ATTEMPTS: 5,
  WINDOW_MINUTES: 15,
  LOCKOUT_MINUTES: 15
};

/**
 * Check if IP/email is rate limited for login attempts
 */
async function checkRateLimit(identifier: string): Promise<{
  allowed: boolean;
  attemptsRemaining: number;
  retryAfter?: number;
}> {
  const key = `ratelimit:login:${identifier}`;
  
  try {
    const record = await kv.get(key);
    const now = Date.now();
    
    if (!record) {
      // First attempt
      await kv.set(key, {
        attempts: 1,
        windowStart: now,
        lockedUntil: null
      });
      return { allowed: true, attemptsRemaining: RATE_LIMIT.MAX_ATTEMPTS - 1 };
    }
    
    const data = JSON.parse(record);
    
    // Check if locked
    if (data.lockedUntil && data.lockedUntil > now) {
      const retryAfter = Math.ceil((data.lockedUntil - now) / 1000);
      return { allowed: false, attemptsRemaining: 0, retryAfter };
    }
    
    // Check if window expired
    const windowExpired = (now - data.windowStart) > (RATE_LIMIT.WINDOW_MINUTES * 60 * 1000);
    if (windowExpired) {
      // Reset window
      await kv.set(key, {
        attempts: 1,
        windowStart: now,
        lockedUntil: null
      });
      return { allowed: true, attemptsRemaining: RATE_LIMIT.MAX_ATTEMPTS - 1 };
    }
    
    // Increment attempts
    const newAttempts = data.attempts + 1;
    
    if (newAttempts >= RATE_LIMIT.MAX_ATTEMPTS) {
      // Lock out
      const lockedUntil = now + (RATE_LIMIT.LOCKOUT_MINUTES * 60 * 1000);
      await kv.set(key, {
        ...data,
        attempts: newAttempts,
        lockedUntil
      });
      return { 
        allowed: false, 
        attemptsRemaining: 0, 
        retryAfter: RATE_LIMIT.LOCKOUT_MINUTES * 60 
      };
    }
    
    // Still within limits
    await kv.set(key, {
      ...data,
      attempts: newAttempts
    });
    
    return { 
      allowed: true, 
      attemptsRemaining: RATE_LIMIT.MAX_ATTEMPTS - newAttempts 
    };
  } catch (error) {
    console.error('Rate limit check error:', error);
    // Fail open (allow) to prevent blocking legitimate users
    return { allowed: true, attemptsRemaining: RATE_LIMIT.MAX_ATTEMPTS };
  }
}

/**
 * Clear rate limit on successful login
 */
async function clearRateLimit(identifier: string): Promise<void> {
  const key = `ratelimit:login:${identifier}`;
  await kv.del(key);
}

// Export for use in auth routes
export { checkRateLimit, clearRateLimit, RATE_LIMIT };
```

### Step 2: Integrate with Login Endpoint

Update your login handler in `/supabase/functions/server/index.tsx`:

```typescript
import { checkRateLimit, clearRateLimit } from './auth';

// In your login route
app.post('/auth/login', async (c) => {
  const { email, password } = await c.req.json();
  
  // Check rate limit
  const rateLimit = await checkRateLimit(email);
  
  if (!rateLimit.allowed) {
    return c.json({
      error: 'Too many login attempts. Please try again later.',
      retryAfter: rateLimit.retryAfter
    }, 429); // 429 Too Many Requests
  }
  
  try {
    // Attempt login via Supabase
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) {
      // Failed login - rate limit still applies
      return c.json({
        error: 'Invalid email or password',
        attemptsRemaining: rateLimit.attemptsRemaining
      }, 401);
    }
    
    // Successful login - clear rate limit
    await clearRateLimit(email);
    
    return c.json({
      success: true,
      session: data.session
    });
  } catch (error) {
    console.error('Login error:', error);
    return c.json({ error: 'Login failed' }, 500);
  }
});
```

### Step 3: Also Rate Limit Signup (Optional but Recommended)

```typescript
app.post('/auth/signup', async (c) => {
  const { email, password, name } = await c.req.json();
  
  // Rate limit signups too (prevent spam)
  const ipAddress = c.req.header('x-forwarded-for') || 'unknown';
  const rateLimit = await checkRateLimit(ipAddress);
  
  if (!rateLimit.allowed) {
    return c.json({
      error: 'Too many signup attempts. Please try again later.',
      retryAfter: rateLimit.retryAfter
    }, 429);
  }
  
  // ... rest of signup logic
});
```

---

## 🧪 Testing Rate Limiting

### Manual Test (Quick)

```bash
# Test from terminal (replace with your project URL)
EMAIL="test@example.com"
PASSWORD="wrong-password"
API_URL="https://YOUR-PROJECT.supabase.co/functions/v1/make-server-f116e23f"

# Attempt 1
curl -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"

# Repeat 5 times...
# 6th attempt should return 429 error
```

### Automated Test (Use Test Control Panel)

```
1. Open Test Control Panel
2. Click "Comprehensive Auth Audit (P0)"
3. Check AUTH-P0.3 results
4. Should now show PASS instead of WARNING
```

---

## 📊 Verification Checklist

After configuration, verify:

- [ ] 5 failed login attempts within 15 minutes trigger lockout
- [ ] Locked users receive clear error message with retry time
- [ ] Lockout expires after 15 minutes
- [ ] Successful login clears rate limit counter
- [ ] Rate limiting doesn't affect legitimate users
- [ ] 429 status code returned when rate limited
- [ ] Different users are tracked independently

---

## 🔍 Monitoring & Debugging

### Check Rate Limit Records (KV Store)

```typescript
// In browser console or backend
const key = 'ratelimit:login:user@example.com';
const record = await kv.get(key);
console.log('Rate limit record:', JSON.parse(record));

// Output:
// {
//   attempts: 3,
//   windowStart: 1708512000000,
//   lockedUntil: null
// }
```

### Monitor Rate Limiting in Logs

```typescript
// Add logging to checkRateLimit function
console.log('🔒 Rate limit check:', {
  identifier,
  attempts: data.attempts,
  allowed: result.allowed,
  retryAfter: result.retryAfter
});
```

### Dashboard Metrics (If using Supabase Enterprise)

```
1. Go to: Supabase Dashboard → Logs
2. Filter by: "Rate limit" or 429 status
3. View: Blocked requests over time
4. Alert: Set up alerts for excessive rate limiting
```

---

## ⚠️  Important Security Notes

### DO:
- ✅ Rate limit by **email** for login attempts
- ✅ Rate limit by **IP address** for signup attempts  
- ✅ Return 429 status code for rate-limited requests
- ✅ Include retry-after time in response
- ✅ Clear rate limit on successful login
- ✅ Log rate limit events for monitoring

### DON'T:
- ❌ Don't reveal if email exists ("Invalid email or password")
- ❌ Don't show different messages for wrong email vs wrong password
- ❌ Don't make lockout window too long (frustrates users)
- ❌ Don't rate limit successful logins
- ❌ Don't store passwords in rate limit records

---

## 🚀 Deployment Steps

1. **Implement backend rate limiting** (Method 2 above)
   ```
   - Update /supabase/functions/server/auth.ts
   - Add checkRateLimit() and clearRateLimit()
   - Integrate with login endpoint
   ```

2. **Deploy backend changes**
   ```bash
   # Deploy your Edge Functions
   supabase functions deploy
   ```

3. **Test thoroughly**
   ```
   - Run AUTH-P0.3 test via Test Control Panel
   - Manual test with wrong password 6 times
   - Verify lockout message appears
   - Wait 15 minutes and test again
   ```

4. **Monitor in production**
   ```
   - Check logs for 429 responses
   - Monitor if legitimate users getting blocked
   - Adjust limits if needed
   ```

---

## 📈 Recommended Rate Limits

| Endpoint | Max Attempts | Window | Notes |
|----------|--------------|--------|-------|
| Login (email/password) | 5 | 15 min | AUTH-P0.3 requirement |
| Signup | 3 | 1 hour | Prevent spam accounts |
| Password Reset | 3 | 1 hour | Prevent enumeration |
| Kid PIN Login | 5 | 15 min | Already implemented ✅ |
| API Calls (general) | 100 | 1 min | Prevent DoS |

---

## 🎯 Success Criteria

Rate limiting is correctly configured when:

✅ AUTH-P0.3 test shows **PASS** instead of WARNING  
✅ 6 failed login attempts return 429 error  
✅ Lockout message shows retry time  
✅ Lockout expires after 15 minutes  
✅ Successful login resets counter  
✅ No infinite loops or crashes  
✅ Legitimate users not affected  

---

## 💡 Next Steps

1. **Implement Method 2** (backend rate limiting) - **DO THIS FIRST**
2. Test with AUTH-P0.3 audit
3. Deploy to production
4. Monitor logs for rate limit events
5. (Optional) Implement Method 1 if using Supabase Enterprise

**Questions?** Check:
- `/AUTH_AUDIT_FIXES.md` for overall audit status
- `/COMPREHENSIVE_AUTH_AUDIT_SUMMARY.md` for test details
- Supabase Docs: https://supabase.com/docs/guides/auth

---

**Status:** Ready to implement ✅  
**Estimated Time:** 30-60 minutes  
**Difficulty:** Medium  
**Impact:** High (security requirement)
