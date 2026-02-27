# ✅ Quick Visual Test Checklist

## 🎯 CRITICAL PATHS - TEST THESE FIRST

### 1. Parent Login & Dashboard (2 min)
```
☐ Go to /login
☐ Enter email + password
☐ Should redirect to /onboarding OR / (if family exists)
☐ See parent dashboard with children list
☐ Click on a child → See their data
☐ No console errors
```

### 2. Kid Login Flow (2 min)
```
☐ Go to /kid/login
☐ Enter family code (get from Settings page)
☐ Should see kid profiles with avatars
☐ Click a kid → See PIN pad
☐ Enter correct PIN → Navigate to /kid/home
☐ See KidDashboard with adventure theme
☐ Points display visible at top
☐ No console errors
```

### 3. Reward Request (Kid Side) (2 min)
```
☐ On KidDashboard, scroll to "Ask for Rewards 🎁"
☐ Should see reward cards with point badges
☐ Cards with enough points show "Ask Parent" button
☐ Cards without enough points show progress bar
☐ Click "Ask Parent" → Dialog opens
☐ Type message: "Can we go on Friday? 🥺"
☐ Click "Send Request" → Toast appears
☐ Card changes to "Waiting for parent..."
☐ No console errors
```

### 4. Reward Request (Parent Side) (2 min)
```
☐ Go to /redemption-requests
☐ See "Pending" tab with badge count (1)
☐ See kid's request with their message
☐ Click "Approve" → Points deducted
☐ Request moves to "To Deliver" tab
☐ Click "Mark as Delivered" → Moves to "Delivered"
☐ OR click "Decline" → Enter reason → Moves to "Declined"
☐ No console errors
```

### 5. Wishlist Flow (3 min)
```
☐ As kid: Go to /kid/wishlist
☐ Type wish: "I want a new bike! 🚲"
☐ Click "Add to Wishlist" → Toast appears
☐ See wish in "My Wishes" list
☐ As parent: Go to /wishlist
☐ See kid's wish
☐ Click "Convert to Reward"
☐ Fill in name, description, points
☐ Click "Create Reward"
☐ Wish marked as "Converted to Reward"
☐ Go to /rewards → See new reward
☐ No console errors
```

---

## 🔧 EDGE CASES - TEST IF TIME PERMITS

### Wrong PIN (1 min)
```
☐ Kid login → Enter wrong PIN
☐ See "Incorrect PIN" message
☐ Attempts counter shows 2 remaining
☐ After 3 wrong attempts → 1 hour lockout
```

### Session Expiration (needs 30 min wait)
```
☐ Login as parent
☐ Wait 30+ minutes
☐ Try to navigate → Should redirect to /login
```

### Multiple Kids (2 min)
```
☐ Parent adds 2+ children
☐ Kid 1 logs in → Sees only their data
☐ Logout → Kid 2 logs in → Sees different data
☐ No data leakage between kids
```

### Pending Request Duplicate Prevention (1 min)
```
☐ Kid requests a reward
☐ Card shows "Waiting for parent..."
☐ Try to request same reward again
☐ Button still shows "Waiting..." (disabled)
```

---

## 🐛 CONSOLE ERROR CHECK

### What to Look For:
```
✅ GOOD:
- Log messages starting with 🔄, ✅, 🔐, 👶
- "Session refreshed successfully"
- "Kid mode detected"
- "Request sent successfully"

❌ BAD (report these):
- "Failed to fetch"
- "TypeError: Cannot read property"
- "404 Not Found"
- "401 Unauthorized" (unless intentional)
- Red errors in console
```

---

## 📱 MOBILE RESPONSIVE CHECK (2 min)

```
☐ Open DevTools → Toggle device toolbar
☐ iPhone 12 Pro view (390x844)
☐ KidDashboard should be readable
☐ Buttons are tappable (not too small)
☐ Cards stack vertically
☐ No horizontal scroll
☐ Dialog fits on screen
```

---

## 🎨 VISUAL POLISH CHECK

### Kid Mode Colors
```
☐ Midnight blue background (#1a365d)
☐ Warm gold accents (#f59e0b)
☐ Purple/pink gradients on cards
☐ Smooth animations on hover
☐ Confetti on achievements (if implemented)
```

### Parent Mode
```
☐ Clean white/gray interface
☐ Blue accent color
☐ Professional typography
☐ Clear status badges (green, amber, red)
☐ Consistent spacing
```

---

## ⚡ PERFORMANCE CHECK

```
☐ Page loads in < 2 seconds
☐ Reward cards render smoothly
☐ Dialog opens without lag
☐ No flickering on route changes
☐ Images load progressively
```

---

## 🔐 SECURITY SANITY CHECK

```
☐ Parent token NOT visible in localStorage
   (Managed by Supabase internally)
☐ Kid token stored as "kid_access_token"
☐ Family ID stored as "fgs_family_id"
☐ PIN never stored in localStorage
☐ No sensitive data in URL
☐ Network tab: Authorization headers present
```

---

## 📊 DATA INTEGRITY CHECK

### After Kid Requests Reward
```
☐ Kid's points NOT deducted yet (pending)
☐ Request visible in parent dashboard
☐ After approval: Points deducted correctly
☐ Audit log shows who approved + when
☐ Request status = 'approved'
```

### After Parent Adds Points
```
☐ Kid sees updated points (may need refresh)
☐ New rewards become available
☐ Progress bars update
☐ Milestone progress reflects change
```

---

## ✅ SIGN-OFF CHECKLIST

**Before declaring "READY":**

- [ ] Parent login works
- [ ] Kid login works
- [ ] Kid can request rewards
- [ ] Parent can approve/decline
- [ ] Wishlist submission works
- [ ] Wishlist conversion works
- [ ] No console errors during normal use
- [ ] Mobile layout looks good
- [ ] Role switching works (parent ↔ kid)
- [ ] Data persists after page refresh

**If ALL checked → System is SOLID! 🎉**

---

## 🚨 WHAT TO DO IF YOU FIND BUGS

1. **Console Errors**
   - Take screenshot of error
   - Note what you were doing
   - Check Network tab for failed requests

2. **UI Glitches**
   - Screenshot the issue
   - Note screen size
   - Browser + version

3. **Data Issues**
   - Check localStorage (DevTools → Application)
   - Check if familyId is present
   - Check if userId matches logged-in user

4. **API Failures**
   - Check Network tab
   - Look at request payload
   - Look at response body
   - Note status code (401, 403, 500, etc.)

---

**Quick Test Time**: ~15 minutes  
**Full Test Time**: ~30 minutes  
**Recommended Frequency**: Before each major release

**Last Updated**: 2026-02-20  
**Test Version**: 1.0.0
