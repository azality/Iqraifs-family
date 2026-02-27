# FGS Login System Guide

**Last Updated:** February 19, 2026  
**Version:** 2.0 (Post-Cleanup)

---

## 🎯 Overview

The Family Growth System (FGS) implements a dual-authentication architecture designed for both parents and children with different security models and use cases.

### Authentication Principles

1. **Parent Login** - Full JWT authentication via Supabase with email/password
2. **Kid Login** - Lightweight session-based authentication using family codes and PINs
3. **Device Independence** - Modern implementation works across any device
4. **Security Layers** - Rate limiting, PIN lockouts, device fingerprinting, session management

---

## 🚪 Login Routes Reference

### Current Active Routes

| Route | Component | Auth Method | Use Case | Device Independence |
|-------|-----------|-------------|----------|---------------------|
| `/login` | `ParentLogin` | Supabase email/password | Parent authentication | ✅ Yes |
| `/parent-login` | `ParentLogin` | Supabase email/password | Parent authentication (explicit alias) | ✅ Yes |
| `/kid-login-new` | `KidLoginNew` | Family code + PIN | **PRIMARY kid login** | ✅ Yes |
| `/kid/login` | `KidLoginNew` | Family code + PIN | Kid login (alternative path) | ✅ Yes |

### Legacy Routes (Auto-Redirect)

| Route | Redirects To | Status |
|-------|--------------|--------|
| `/kid-login` | `/kid-login-new` | ⚠️ Deprecated - redirects automatically |

---

## 👨‍👩‍👧‍👦 Parent Authentication

### Routes
- **Primary:** `/login`
- **Alias:** `/parent-login` (both are identical)

### Component
`/src/app/pages/ParentLogin.tsx`

### Authentication Flow

```
1. User enters email + password
2. System clears any stale kid session data (prevents race conditions)
3. Supabase validates credentials
4. JWT access token generated
5. Session stored in localStorage:
   - `fgs_auth_token` - JWT access token
   - `fgs_user_id` - Parent user ID
   - `fgs_family_id` - Primary family ID
6. Redirect to dashboard
```

### Security Features

✅ **Email/Password Authentication**  
✅ **JWT Token Management**  
✅ **Session Persistence**  
✅ **Automatic Token Refresh**  
✅ **Pre-login Cleanup** (clears conflicting kid sessions)

### Code Example

```typescript
// Parent login usage
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'parent@example.com',
  password: 'password123'
});

// Session stored automatically by AuthContext
```

---

## 👶 Kid Authentication (Modern Implementation)

### Routes
- **Primary:** `/kid-login-new`
- **Alias:** `/kid/login`

### Component
`/src/app/pages/KidLoginNew.tsx`

### Authentication Flow

```
1. Kid enters FAMILY CODE (6-character alphanumeric)
   ↓
2. Backend validates code and returns family info + kid list
   ↓
3. Kid selects their profile from avatar grid
   ↓
4. Kid enters 4-digit PIN on numeric keypad
   ↓
5. Backend verifies:
   - Family code exists
   - Child belongs to family
   - PIN matches hashed value
   - Device not locked out
   ↓
6. Session created with device fingerprint
   ↓
7. Session token stored:
   - `kid_session_token` - Temporary session JWT
   - `selected_child_id` - Child's ID
   - `fgs_family_id` - Family ID (for context)
   ↓
8. Redirect to kid dashboard
```

### Security Features

✅ **Device-Independent** - Works on any device with family code  
✅ **PIN Rate Limiting** - 5 attempts before 30-minute lockout  
✅ **Device Fingerprinting** - Tracks attempts per device  
✅ **Hashed PINs** - SHA-256 hashed, never stored in plaintext  
✅ **Session Expiration** - Auto-expires after inactivity  
✅ **No Password Required** - Simplified for young children

### Backend Route
`POST /make-server-f116e23f/kid/login`

### Request Format

```json
{
  "familyCode": "ABC123",
  "childId": "child:uuid",
  "pin": "1234"
}
```

### Response Format

```json
{
  "success": true,
  "session": {
    "token": "kid_session_jwt_token",
    "childId": "child:uuid",
    "familyId": "family:uuid",
    "expiresAt": "2026-02-19T23:59:59Z"
  },
  "child": {
    "id": "child:uuid",
    "name": "Ahmed",
    "avatar": "🦁",
    "points": 150
  }
}
```

### Code Example

```typescript
// Kid login usage
const response = await publicApiCall('/public/verify-family-code', {
  method: 'POST',
  body: JSON.stringify({
    familyCode: familyCode.trim().toUpperCase()
  })
});

// Then verify PIN
const loginResponse = await publicApiCall('/kid/login', {
  method: 'POST',
  body: JSON.stringify({
    familyCode,
    childId: selectedKid.id,
    pin
  })
});
```

---

## 🔒 Security Architecture

### Parent Security Model

| Layer | Implementation |
|-------|----------------|
| **Authentication** | Supabase Auth (industry-standard) |
| **Token Storage** | localStorage with `fgs_` prefix |
| **Token Type** | JWT with 1-hour expiration |
| **Session Refresh** | Automatic via AuthContext |
| **Multi-device** | Full support via cloud sync |

### Kid Security Model

| Layer | Implementation |
|-------|----------------|
| **Authentication** | Custom session-based (family code + PIN) |
| **Rate Limiting** | 5 attempts per 30 minutes per device |
| **PIN Hashing** | SHA-256 (server-side) |
| **Device Tracking** | IP + User-Agent fingerprinting |
| **Session Duration** | Configurable (default: 24 hours) |
| **Lockout Recovery** | Time-based automatic unlock |

---

## 🧹 Migration from Legacy Kid Login

### What Changed?

**Old System (`KidLogin.tsx` - REMOVED)**
- ❌ Required parent to log in first on same device
- ❌ Relied on localStorage family ID
- ❌ Not portable across devices
- ❌ Confusing error messages for new users

**New System (`KidLoginNew.tsx` - CURRENT)**
- ✅ Uses family invite code (no pre-requisites)
- ✅ Works on any device
- ✅ Better UX with visual kid selection
- ✅ Robust backend session management

### Auto-Redirect in Place

Any links or bookmarks to `/kid-login` automatically redirect to `/kid-login-new`.

**Action Required:** None - backwards compatible with automatic redirect.

---

## 📱 User Experience Flow

### Parent Login Journey

```
📧 Enter email/password
  ↓
🔐 Supabase authentication
  ↓
✅ Token stored
  ↓
🏠 Dashboard (ParentDashboard or KidDashboard based on mode)
```

### Kid Login Journey

```
🔢 Enter family code (ABC123)
  ↓
👨‍👩‍👧‍👦 Family validated - "Welcome to The Ahmed Family! 🏡"
  ↓
👶 Select profile (visual avatar grid)
  ↓
🔢 Enter PIN (numeric keypad, large buttons)
  ↓
✅ Session created
  ↓
🎮 Kid Adventure Dashboard
```

---

## 🛠️ Developer Reference

### Key Files

| File | Purpose |
|------|---------|
| `/src/app/routes.tsx` | Route definitions and redirects |
| `/src/app/pages/ParentLogin.tsx` | Parent authentication UI |
| `/src/app/pages/KidLoginNew.tsx` | Kid authentication UI |
| `/src/app/contexts/AuthContext.tsx` | Global auth state management |
| `/src/app/utils/authHelpers.ts` | Session management utilities |
| `/supabase/functions/server/index.tsx` | Backend auth endpoints |
| `/supabase/functions/server/kidSessions.tsx` | Kid session management |
| `/supabase/functions/server/middleware.tsx` | Auth middleware |

### Environment Variables

```bash
# Required for parent authentication
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJxxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxxx...

# JWT verification
JWT_SECRET=your-jwt-secret
```

### localStorage Keys Reference

#### Parent Session
```
fgs_auth_token          # JWT access token
fgs_user_id             # Parent user UUID
fgs_family_id           # Primary family UUID
fgs_user_role           # Always 'parent'
```

#### Kid Session
```
kid_session_token       # Temporary session token
selected_child_id       # Child UUID
fgs_family_id           # Family UUID (context only)
```

### AuthContext API

```typescript
interface AuthContextType {
  user: User | null;                    // Current authenticated user (parent)
  isAuthenticated: boolean;             // Parent JWT valid
  isKidMode: boolean;                   // Kid session active
  currentChild: Child | null;           // Active child in kid mode
  loading: boolean;                     // Auth check in progress
  login: (email, password) => Promise<void>;
  logout: () => void;
  refreshSession: () => Promise<void>;
}
```

---

## 🐛 Troubleshooting

### Common Issues

#### "No family found" error on kid login
**Cause:** Old `/kid-login` implementation (legacy)  
**Fix:** System now auto-redirects to `/kid-login-new` - refresh the page

#### Kids can't log in from different devices
**Cause:** Using old device-locked implementation  
**Fix:** Ensure using `/kid-login-new` route (should auto-redirect)

#### "Too many failed attempts"
**Cause:** PIN rate limiting after 5 wrong attempts  
**Fix:** Wait 30 minutes or contact parent to reset PIN

#### Parent login clears kid session
**Expected Behavior:** Parent login intentionally clears kid data to prevent context conflicts

---

## 🚀 Best Practices

### For UI/UX Design

1. **Parent Login**
   - Use email/password fields (standard inputs)
   - Show "Forgot Password" link (Supabase built-in)
   - Clear error messages for invalid credentials

2. **Kid Login**
   - Large, colorful buttons for avatar selection
   - Numeric keypad for PIN (avoid keyboard)
   - Friendly error messages ("Oops! Try again 🌙")
   - Show family name after code validation for confidence

### For Security

1. **Never** log PINs or tokens in production
2. **Always** use HTTPS in production
3. **Implement** proper logout flows (clear localStorage)
4. **Monitor** failed login attempts via audit logs
5. **Educate** parents about keeping family codes secure

### For Session Management

```typescript
// ✅ Good - Check auth state before protected operations
if (!isAuthenticated && !isKidMode) {
  navigate('/login');
  return;
}

// ❌ Bad - Assume session is valid
const userId = localStorage.getItem('fgs_user_id'); // Could be stale!
```

---

## 📊 Analytics & Monitoring

### Metrics to Track

- Parent login success/failure rates
- Kid login success/failure rates
- PIN lockout frequency (security indicator)
- Session duration averages
- Cross-device login patterns

### Audit Trail

All authentication events are logged in the system audit trail:
- `parent_login_success`
- `parent_login_failed`
- `kid_login_success`
- `kid_login_failed`
- `kid_pin_locked`
- `session_expired`

---

## 🔮 Future Enhancements

### Planned Features

- [ ] Biometric authentication for parents (Face ID/Touch ID)
- [ ] Multi-factor authentication for parents
- [ ] Parent-controlled PIN reset flow (in Settings)
- [ ] Session activity dashboard (see all active sessions)
- [ ] Magic link authentication for parents (passwordless)
- [ ] Kid profile pictures instead of emoji avatars
- [ ] Voice recognition for kid login (accessibility)

### Under Consideration

- Social login (Google, Apple) for parents
- QR code family codes for easier entry
- Temporary guest access for babysitters
- Time-limited kid sessions (e.g., 2-hour limit)

---

## 📚 Related Documentation

- [AUTH_ARCHITECTURE_DIAGRAM.md](/AUTH_ARCHITECTURE_DIAGRAM.md) - System architecture
- [KID_PIN_SYSTEM_COMPLETE.md](/KID_PIN_SYSTEM_COMPLETE.md) - PIN security deep dive
- [FAMILY_SIGNUP_AND_INVITE_SYSTEM.md](/FAMILY_SIGNUP_AND_INVITE_SYSTEM.md) - Family code system
- [ROUTE_PROTECTION_MATRIX.md](/ROUTE_PROTECTION_MATRIX.md) - Authorization rules

---

## ✅ Summary

### For Users

- **Parents:** Use `/login` or `/parent-login` with your email and password
- **Kids:** Use `/kid-login-new` with your family code and PIN

### For Developers

- **Legacy routes removed:** `KidLogin.tsx` deleted, auto-redirects in place
- **Primary implementations:** `ParentLogin.tsx` and `KidLoginNew.tsx`
- **No breaking changes:** All old URLs redirect to new system automatically

### Migration Complete ✅

The FGS login system has been streamlined to two clear paths with proper redirects, comprehensive security, and excellent developer documentation.

---

**Questions or Issues?** Check the troubleshooting section or review related documentation files.
