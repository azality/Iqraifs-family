# FGS Login Routes - Quick Reference

**Version:** 2.0 | **Updated:** Feb 19, 2026

---

## 🚀 Quick Links

### For Parents
```
🔗 /login
🔗 /parent-login
```
Both routes are **identical** - use either one for parent email/password login.

### For Kids
```
🔗 /kid-login-new  ← PRIMARY
🔗 /kid/login      ← ALIAS
```
Modern family code + PIN authentication. Works on any device.

---

## ⚡ At a Glance

| Route | Who | How | Device-Free |
|-------|-----|-----|-------------|
| `/login` | Parents | Email + Password | ✅ |
| `/parent-login` | Parents | Email + Password | ✅ |
| `/kid-login-new` | Kids | Family Code + PIN | ✅ |
| `/kid/login` | Kids | Family Code + PIN | ✅ |
| `/kid-login` | ⚠️ Legacy | Auto-redirects | N/A |

---

## 🔄 Redirects Active

```
/kid-login  →  /kid-login-new
```

The old device-locked kid login has been deprecated. All `/kid-login` URLs automatically redirect to the new implementation.

---

## 📝 Parent Login Example

```tsx
// Navigate to either route
<Link to="/login">Parent Login</Link>
<Link to="/parent-login">Parent Login</Link>

// Both render ParentLogin component
// Uses Supabase auth with email/password
```

**Backend:** Supabase Auth (built-in)

---

## 📝 Kid Login Example

```tsx
// Navigate to either route
<Link to="/kid-login-new">Kid Login</Link>
<Link to="/kid/login">Kid Login</Link>

// Both render KidLoginNew component
// Uses family code + PIN system
```

**Backend:** `POST /make-server-f116e23f/kid/login`

---

## 🛡️ Security Quick Facts

### Parent Auth
- JWT tokens (1-hour expiration)
- Automatic refresh via AuthContext
- Stored in localStorage with `fgs_` prefix
- Multi-device support via Supabase cloud

### Kid Auth
- Family code (6-char alphanumeric)
- 4-digit PIN (SHA-256 hashed)
- Rate limiting: 5 attempts/30min
- Device fingerprinting
- Session tokens expire after 24h

---

## 🧹 Migration Notes

### What Was Removed
- ❌ `/src/app/pages/KidLogin.tsx` (deleted)
- ❌ Device-locked kid authentication (deprecated)
- ❌ localStorage family ID requirement (removed)

### What Was Added
- ✅ Auto-redirect from `/kid-login` → `/kid-login-new`
- ✅ Comprehensive security documentation
- ✅ Device-independent kid login

### Breaking Changes
**None** - All old URLs work via automatic redirects.

---

## 🎯 Developer Checklist

When implementing login UI:

### Parent Login
- [ ] Use `/login` or `/parent-login` route
- [ ] Render `ParentLogin` component
- [ ] Include email and password inputs
- [ ] Show Supabase error messages
- [ ] Clear any kid session data on mount

### Kid Login
- [ ] Use `/kid-login-new` route (or `/kid/login`)
- [ ] Render `KidLoginNew` component
- [ ] Step 1: Family code input (6 characters)
- [ ] Step 2: Visual kid selector (avatars)
- [ ] Step 3: Numeric PIN pad (large buttons)
- [ ] Show friendly error messages
- [ ] Handle lockout states gracefully

---

## 📦 Component Reference

```tsx
// Parent Login
import { ParentLogin } from './pages/ParentLogin';

// Kid Login  
import { KidLoginNew } from './pages/KidLoginNew';

// No longer used (deleted)
// import { KidLogin } from './pages/KidLogin'; ❌
```

---

## 🔍 localStorage Keys

### Parent Session
```javascript
localStorage.getItem('fgs_auth_token')      // JWT
localStorage.getItem('fgs_user_id')         // User UUID
localStorage.getItem('fgs_family_id')       // Family UUID
```

### Kid Session
```javascript
localStorage.getItem('kid_session_token')   // Session JWT
localStorage.getItem('selected_child_id')   // Child UUID
localStorage.getItem('fgs_family_id')       // Family context
```

---

## 🚨 Common Errors & Fixes

### "No family found" (kid login)
**Old Error:** Appeared when using legacy `/kid-login` without parent pre-login  
**Fix:** Now auto-redirects to `/kid-login-new` which doesn't require this

### "Invalid family code"
**Cause:** Typo in family code or code doesn't exist  
**Fix:** Double-check code (case-insensitive), verify in Settings

### "Too many failed attempts"
**Cause:** 5+ wrong PIN attempts  
**Fix:** Wait 30 minutes or have parent reset in Settings

### "Session expired"
**Cause:** Kid session token expired (default: 24h)  
**Fix:** Log in again with family code + PIN

---

## 📚 Full Documentation

For complete details, see [LOGIN_SYSTEM_GUIDE.md](LOGIN_SYSTEM_GUIDE.md)

---

## ✅ Summary

- **2 login types:** Parent (email/password) & Kid (family code + PIN)
- **4 active routes:** `/login`, `/parent-login`, `/kid-login-new`, `/kid/login`
- **1 auto-redirect:** `/kid-login` → `/kid-login-new`
- **0 breaking changes:** All old URLs work seamlessly

**Use `/kid-login-new` for all new kid login implementations.**

---

Last updated: Feb 19, 2026 | FGS v2.0
