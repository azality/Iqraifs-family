# 🚨 CRITICAL: Verify JWT Auto-Enable Issue

## The Problem

**Supabase Edge Functions** have a setting called **"Verify JWT"** that:
- ❌ **Blocks ALL requests without valid Supabase Auth JWT tokens**
- ❌ **Breaks public endpoints** like `/auth/signup` and `/public/*`
- ❌ **Auto-enables on EVERY backend code update**

---

## Symptoms

### When "Verify JWT" is Enabled:
```
POST /auth/signup → 401 "Missing authorization header"
POST /public/verify-family-code → 401 "Missing authorization header"
GET /public/families/:id/children → 401 "Missing authorization header"
```

All public endpoints fail even though they're designed to work without auth.

---

## Solution

### After EVERY Backend Update:

1. **Wait 15-30 seconds** for Edge Function to deploy
2. **Go to Supabase Dashboard**:
   ```
   Supabase Console
   → Functions (left sidebar)
   → make-server-f116e23f
   → Settings tab
   → Find "Verify JWT" toggle
   → Set to OFF (disabled)
   ```
3. **Wait 5-10 seconds** for setting to apply
4. **Test a public endpoint** to confirm it works

---

## Why This Happens

- Supabase treats "Verify JWT" as a deployment-time security default
- It resets to **enabled** whenever the function code changes
- This is Supabase's way of preventing accidental public API exposure
- We intentionally have public endpoints (signup, kid login) so we must disable it

---

## Testing if JWT Verification is Enabled

### Quick Test (Browser Console):
```javascript
const { projectId, publicAnonKey } = await import('./utils/supabase/info');

// Test public signup endpoint
const response = await fetch(
  `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/auth/signup`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${publicAnonKey}`
    },
    body: JSON.stringify({
      email: 'test@example.com',
      password: 'TestPassword123!',
      name: 'Test User'
    })
  }
);

console.log('Status:', response.status);
const data = await response.json();
console.log('Response:', data);
```

**If JWT is enabled**: Status 401, `"Missing authorization header"`  
**If JWT is disabled**: Status 400 (duplicate email) or 200 (success)

---

## Backend Updates That Trigger Re-Enable

✅ **These require manual disable after deployment**:
- Adding new endpoints
- Modifying existing endpoints
- Changing middleware
- Updating validation logic
- Any change to `/supabase/functions/server/index.tsx`
- Any change to imported files (`middleware.tsx`, `validation.tsx`, etc.)

❌ **These do NOT trigger re-enable**:
- Frontend changes
- Test file changes
- Documentation updates
- Client-side code changes

---

## Permanent Solution (Future)

**Option 1**: Environment Variable Override
```typescript
// In index.tsx, check for public endpoints first
app.use('*', async (c, next) => {
  const path = c.req.path;
  const publicPaths = ['/auth/signup', '/public/'];
  
  if (publicPaths.some(p => path.includes(p))) {
    return next(); // Skip JWT verification
  }
  
  // Continue with JWT verification for protected routes
  await next();
});
```

**Option 2**: Separate Edge Functions
- `make-server-public` - No JWT verification (signup, kid login)
- `make-server-protected` - JWT required (all other endpoints)

**Current Status**: Using manual disable (Option 1 requires Supabase config changes)

---

## Checklist for Every Deployment

```
[ ] 1. Code changes saved
[ ] 2. Wait 15-30 seconds for Edge Function deployment
[ ] 3. Open Supabase Dashboard
[ ] 4. Navigate to Functions → make-server-f116e23f → Settings
[ ] 5. Disable "Verify JWT" toggle
[ ] 6. Wait 5-10 seconds
[ ] 7. Test public endpoint (e.g., health check)
[ ] 8. Run test suite
```

---

## Related Issues

- **TD-1.1 Setup Failure**: 401 errors during test family creation
- **Kid Login Broken**: Can't fetch family children
- **Parent Signup Broken**: Can't create new accounts

All resolved by disabling "Verify JWT" after deployment.

---

## Documentation

- See: `/BACKEND_ENDPOINTS_ADDED.md` for recent changes
- See: `/TEST_EXECUTION_GUIDE.md` for full testing workflow
- See: `/TEST_ENVIRONMENT_GUIDE.md` for test family setup
