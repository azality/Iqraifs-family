# 🔐 Auth System Quick Reference

## 📦 localStorage Keys

### Shared (Persists across sessions)
```javascript
fgs_family_id: "family:1234567890"  // UUID - never cleared on logout
```

### Parent Mode
```javascript
user_mode: "parent"
// Supabase session in separate storage (managed by SDK)
```

### Kid Mode
```javascript
user_mode: "kid"
kid_access_token: "kid_abc123def456..."
kid_id: "child:123"
kid_name: "Ahmed"
kid_avatar: "👦"
kid_family_code: "ABC123"
```

---

## 🔑 Auth Helper Functions

### Import
```typescript
import {
  // Parent
  setParentMode,
  getParentToken,
  logoutParent,
  
  // Kid
  setKidMode,
  getKidToken,
  getKidInfo,
  logoutKid,
  
  // Shared
  getCurrentMode,
  getFamilyId,
  isAuthenticated,
  getAuthToken,
  logout,
  clearAllAuth
} from '/src/app/utils/auth';
```

### Usage Examples

#### Parent Login
```typescript
import { setParentMode } from '/src/app/utils/auth';

// After Supabase login success
const familyId = response[0].id;
setParentMode(familyId);
navigate('/parent/home');
```

#### Kid Login
```typescript
import { setKidMode } from '/src/app/utils/auth';

// After /kid/login success
setKidMode(
  response.kidAccessToken,  // "kid_abc123..."
  response.kid,             // { id, name, avatar, familyId }
  response.familyCode       // "ABC123"
);
navigate('/kid/home');
```

#### Get Current Mode
```typescript
import { getCurrentMode } from '/src/app/utils/auth';

const mode = getCurrentMode();
// Returns: 'parent' | 'kid' | null
```

#### Logout
```typescript
import { logout } from '/src/app/utils/auth';

// Auto-detects mode and clears appropriate data
await logout();
```

---

## 🌐 API Calls

### Import
```typescript
import { get, post, put, del, publicApiCall } from '/src/utils/api-new';
```

### Authenticated Calls (auto-selects token)
```typescript
// In parent mode: uses Supabase JWT
// In kid mode: uses kid_access_token
await get('/families/123/children');
await post('/behaviors', { childId: '456', points: 10 });
```

### Public Calls (no auth)
```typescript
await publicApiCall('/kid/login', {
  method: 'POST',
  body: JSON.stringify({ familyCode, kidName, pin })
});
```

---

## 🛣️ Routes

### Public Routes
- `/` - Mode selection
- `/parent/login` - Parent email/password
- `/parent/signup` - Parent registration
- `/kid/login` - Kid family code + PIN

### Parent Routes (Protected)
- `/parent/home` - Parent dashboard
- `/parent/log` - Log behaviors
- `/parent/challenges` - Manage challenges
- `/parent/settings` - Settings
- `/parent/*` - All other parent features

### Kid Routes (Protected)
- `/kid/home` - Kid adventure dashboard
- `/kid/rewards` - Rewards catalog
- `/kid/quests` - Quest view
- `/kid/*` - All other kid features

---

## 🔒 Route Guards

### RequireParentAuth
```typescript
<RequireParentAuth>
  <ParentDashboard />
</RequireParentAuth>

// Checks: localStorage.user_mode === 'parent'
// Redirects to: /parent/login if not authenticated
```

### RequireKidAuth
```typescript
<RequireKidAuth>
  <KidDashboard />
</RequireKidAuth>

// Checks: localStorage.user_mode === 'kid'
// Redirects to: /kid/login if not authenticated
```

---

## 🎯 Common Patterns

### Check if Authenticated
```typescript
import { isAuthenticated } from '/src/app/utils/auth';

const authed = await isAuthenticated();
if (!authed) {
  navigate('/');
}
```

### Get Auth Token for API
```typescript
import { getAuthToken } from '/src/app/utils/auth';

const { token, type } = await getAuthToken();
console.log(`Token type: ${type}`); // 'parent' or 'kid'
console.log(`Token: ${token}`);
```

### Get Kid Info (when in kid mode)
```typescript
import { getKidInfo } from '/src/app/utils/auth';

const kidInfo = getKidInfo();
if (kidInfo) {
  console.log(`Kid: ${kidInfo.name}`);
  console.log(`Avatar: ${kidInfo.avatar}`);
  console.log(`Family Code: ${kidInfo.familyCode}`);
}
```

### Get Family ID (always available)
```typescript
import { getFamilyId } from '/src/app/utils/auth';

const familyId = getFamilyId();
// Returns: "family:123" or null
```

---

## 🧪 Testing Commands

### Check Current State
```javascript
// In browser console
localStorage.getItem('user_mode')          // 'parent' | 'kid' | null
localStorage.getItem('fgs_family_id')      // Family UUID
localStorage.getItem('kid_access_token')   // Kid token (if kid mode)
```

### Simulate Parent Login
```javascript
localStorage.setItem('user_mode', 'parent');
localStorage.setItem('fgs_family_id', 'family:123');
// Supabase session is separate
```

### Simulate Kid Login
```javascript
localStorage.setItem('user_mode', 'kid');
localStorage.setItem('kid_access_token', 'kid_test123');
localStorage.setItem('kid_id', 'child:456');
localStorage.setItem('kid_name', 'Test Kid');
localStorage.setItem('kid_avatar', '👶');
localStorage.setItem('fgs_family_id', 'family:123');
```

### Clear All (for testing)
```javascript
import { clearAllAuth } from '/src/app/utils/auth';
clearAllAuth(); // ⚠️ Clears EVERYTHING including family ID
```

---

## 🔄 Migration Checklist

- [ ] Backend: POST /kid/login endpoint deployed
- [ ] Replace `/src/app/routes.tsx` with routes-new.tsx
- [ ] Replace `/src/utils/api.ts` with api-new.ts
- [ ] Test parent login flow
- [ ] Test kid login flow
- [ ] Test logout behaviors
- [ ] Test API calls in both modes
- [ ] Test route protection
- [ ] Test session persistence
- [ ] Verify no collision between modes

---

## 🐛 Common Issues

### Issue: "401 Unauthorized" in kid mode
**Solution:** Check that `kid_access_token` is stored and API is using it

### Issue: Kid login fails after parent logout
**Solution:** Verify `fgs_family_id` persists after logout

### Issue: API calls use wrong token
**Solution:** Check `user_mode` is set correctly, use `getAuthToken()`

### Issue: Redirected to wrong login page
**Solution:** Check route guards are using correct mode check

---

**Last Updated:** February 19, 2026  
**Version:** 1.0  
**Status:** Ready for Implementation
