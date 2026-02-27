# Middleware Application Guide - Complete Reference

**Task**: Apply security middleware to all 39 routes in `/supabase/functions/server/index.tsx`

---

## 🎯 Quick Reference Table

| Route | Method | Current | Protected Version |
|-------|--------|---------|-------------------|
| **AUTHENTICATION** ||||
| `/auth/signup` | POST | No middleware | `validate(validateSignup)` |
| `/health` | GET | No middleware | ✅ Keep as-is (public) |
| **FAMILIES** ||||
| `/families` | POST | No middleware | `requireAuth, requireParent, validate(validateFamily)` |
| `/families/:id` | GET | No middleware | `requireAuth, requireFamilyAccess` |
| `/families/:familyId/children` | GET | No middleware | `requireAuth, requireFamilyAccess` |
| **CHILDREN** ||||
| `/children` | POST | No middleware | `requireAuth, requireParent, validate(validateChild)` |
| `/children/:id` | GET | No middleware | `requireAuth, requireFamilyAccess` |
| `/children/:id` | PATCH | No middleware | `requireAuth, requireParent, requireFamilyAccess` |
| `/children/:id/verify-pin` | POST | Has logic | Add `validate(validatePinVerify)` |
| **EVENTS** ||||
| `/events` | POST | No middleware | `requireAuth, requireParent, validate(validatePointEvent)` |
| `/events/:id/void` | POST | No middleware | `requireAuth, requireParent, validate(validateVoid)` |
| `/children/:childId/events` | GET | No middleware | `requireAuth, requireFamilyAccess` |
| **PROVIDERS** ||||
| `/providers` | POST | No middleware | `requireAuth, requireParent, validate(validateProvider)` |
| `/providers` | GET | No middleware | `requireAuth, requireFamilyAccess` |
| `/providers/:id` | PUT | No middleware | `requireAuth, requireParent, validate(validateProvider)` |
| `/providers/:id` | DELETE | No middleware | `requireAuth, requireParent` |
| **ATTENDANCE** ||||
| `/attendance` | POST | No middleware | `requireAuth, requireParent, validate(validateAttendance)` |
| `/children/:childId/attendance` | GET | No middleware | `requireAuth, requireFamilyAccess` |
| **TRACKABLE ITEMS** ||||
| `/trackable-items` | POST | No middleware | `requireAuth, requireParent, validate(validateTrackableItem)` |
| `/trackable-items` | GET | No middleware | `requireAuth, requireFamilyAccess` |
| **MILESTONES** ||||
| `/milestones` | POST | No middleware | `requireAuth, requireParent, validate(validateMilestone)` |
| `/milestones` | GET | No middleware | `requireAuth, requireFamilyAccess` |
| **REWARDS** ||||
| `/rewards` | POST | No middleware | `requireAuth, requireParent, validate(validateReward)` |
| `/rewards` | GET | No middleware | `requireAuth, requireFamilyAccess` |
| **CHALLENGES** ||||
| `/children/:childId/challenges/generate` | POST | No middleware | `requireAuth, requireParent, requireFamilyAccess` |
| `/children/:childId/challenges` | GET | No middleware | `requireAuth, requireFamilyAccess` |
| `/children/:childId/challenges/evaluate` | POST | No middleware | `requireAuth` (both can trigger) |
| `/children/:childId/challenge-analytics` | GET | No middleware | `requireAuth, requireParent, requireFamilyAccess` |
| **QUIZZES** ||||
| `/quizzes` | POST | No middleware | `requireAuth, requireParent, validate(validateQuiz)` |
| `/quizzes` | GET | No middleware | `requireAuth, requireFamilyAccess` |
| `/quizzes/:id` | GET | No middleware | `requireAuth, requireFamilyAccess` |
| `/quizzes/:id` | PATCH | No middleware | `requireAuth, requireParent, validate(validateQuiz)` |
| `/quizzes/:id` | DELETE | No middleware | `requireAuth, requireParent` |
| `/quiz-attempts` | POST | No middleware | `requireAuth, validate(validateQuizAttempt)` |
| `/children/:childId/quiz-attempts` | GET | No middleware | `requireAuth, requireFamilyAccess` |
| `/quizzes/:quizId/attempts` | GET | No middleware | `requireAuth, requireParent` |
| **ADMIN** ||||
| `/admin/recalculate-points/:childId` | POST | No middleware | `requireAuth, requireParent, requireFamilyAccess` |
| `/admin/system-stats` | GET | No middleware | `requireAuth, requireParent` |
| **INVITES** ||||
| `/families/:familyId/invites` | POST | No middleware | `requireAuth, requireParent, requireFamilyAccess, validate(validateInvite)` |
| `/families/:familyId/invites` | GET | No middleware | `requireAuth, requireParent, requireFamilyAccess` |
| `/invites/accept` | POST | No middleware | `validate(validateInviteAccept)` |
| `/invites/:code/revoke` | POST | No middleware | `requireAuth, requireParent` |

---

## 📝 Complete Replacement Code

### **1. Authentication Routes**

```typescript
// Sign up new user (parent)
app.post(
  "/make-server-f116e23f/auth/signup",
  validate(validateSignup),
  async (c) => {
    try {
      const { email, password, name, role } = getValidatedBody(c);
      
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        user_metadata: { name, role: role || 'parent' },
        email_confirm: true
      });

      if (error) {
        console.error('Signup error:', error);
        return c.json({ error: error.message }, 400);
      }

      await kv.set(`user:${data.user.id}`, {
        id: data.user.id,
        email,
        name,
        role: role || 'parent',
        createdAt: new Date().toISOString()
      });

      return c.json({ user: data.user, success: true });
    } catch (error) {
      console.error('Signup error:', error);
      return c.json({ error: 'Signup failed' }, 500);
    }
  }
);
```

---

### **2. Families Routes**

```typescript
// Create family
app.post(
  "/make-server-f116e23f/families",
  requireAuth,
  requireParent,
  validate(validateFamily),
  async (c) => {
    try {
      const { name, parentIds } = getValidatedBody(c);
      const userId = getAuthUserId(c);
      const familyId = `family:${Date.now()}`;
      
      const family = {
        id: familyId,
        name,
        parentIds: parentIds || [userId],
        createdAt: new Date().toISOString()
      };
      
      await kv.set(familyId, family);
      
      // Update user record with familyId
      const user = await kv.get(`user:${userId}`);
      if (user) {
        user.familyId = familyId;
        await kv.set(`user:${userId}`, user);
      }
      
      return c.json(family);
    } catch (error) {
      console.error('Create family error:', error);
      return c.json({ error: 'Failed to create family' }, 500);
    }
  }
);

// Get family by ID
app.get(
  "/make-server-f116e23f/families/:id",
  requireAuth,
  requireFamilyAccess,
  async (c) => {
    try {
      const id = c.req.param('id');
      const family = await kv.get(id);
      
      if (!family) {
        return c.json({ error: 'Family not found' }, 404);
      }
      
      return c.json(family);
    } catch (error) {
      console.error('Get family error:', error);
      return c.json({ error: 'Failed to get family' }, 500);
    }
  }
);
```

---

### **3. Children Routes**

```typescript
// Create child
app.post(
  "/make-server-f116e23f/children",
  requireAuth,
  requireParent,
  validate(validateChild),
  async (c) => {
    try {
      const { name, familyId, avatar, pin } = getValidatedBody(c);
      const childId = `child:${Date.now()}`;
      
      const hashedPin = pin ? await hashPin(pin) : null;
      
      const child = {
        id: childId,
        name,
        familyId,
        avatar: avatar || '👶',
        pin: hashedPin,
        currentPoints: 0,
        highestMilestone: 0,
        targetRewardId: null,
        createdAt: new Date().toISOString()
      };
      
      await kv.set(childId, child);
      
      const { pin: _, ...childWithoutPin } = child;
      return c.json(childWithoutPin);
    } catch (error) {
      console.error('Create child error:', error);
      return c.json({ error: 'Failed to create child' }, 500);
    }
  }
);

// Verify child PIN (already has rate limiting logic, just add validation)
app.post(
  "/make-server-f116e23f/children/:id/verify-pin",
  validate(validatePinVerify),
  async (c) => {
    // ... existing handler (already has built-in rate limiting)
  }
);

// Get children by family
app.get(
  "/make-server-f116e23f/families/:familyId/children",
  requireAuth,
  requireFamilyAccess,
  async (c) => {
    try {
      const familyId = c.req.param('familyId');
      const allChildren = await kv.getByPrefix('child:');
      const familyChildren = allChildren.filter((child: any) => child.familyId === familyId);
      
      return c.json(familyChildren);
    } catch (error) {
      console.error('Get children error:', error);
      return c.json({ error: 'Failed to get children' }, 500);
    }
  }
);

// Get child by ID
app.get(
  "/make-server-f116e23f/children/:id",
  requireAuth,
  requireFamilyAccess,
  async (c) => {
    try {
      const id = c.req.param('id');
      const child = await kv.get(id);
      
      if (!child) {
        return c.json({ error: 'Child not found' }, 404);
      }
      
      return c.json(child);
    } catch (error) {
      console.error('Get child error:', error);
      return c.json({ error: 'Failed to get child' }, 500);
    }
  }
);

// Update child
app.patch(
  "/make-server-f116e23f/children/:id",
  requireAuth,
  requireParent,
  requireFamilyAccess,
  async (c) => {
    try {
      const id = c.req.param('id');
      const updates = await c.req.json();
      
      const child = await kv.get(id);
      if (!child) {
        return c.json({ error: 'Child not found' }, 404);
      }
      
      const updated = { ...child, ...updates };
      await kv.set(id, updated);
      
      return c.json(updated);
    } catch (error) {
      console.error('Update child error:', error);
      return c.json({ error: 'Failed to update child' }, 500);
    }
  }
);
```

---

### **4. Events Routes (CRITICAL)**

```typescript
// Log point event
app.post(
  "/make-server-f116e23f/events",
  requireAuth,
  requireParent,
  validate(validatePointEvent),
  async (c) => {
    try {
      const eventData = getValidatedBody(c);
      const userId = getAuthUserId(c);
      
      // ... existing handler (use eventData and userId from context)
    } catch (error) {
      console.error('Log event error:', error);
      return c.json({ error: 'Failed to log event', details: String(error) }, 500);
    }
  }
);

// Void event
app.post(
  "/make-server-f116e23f/events/:id/void",
  requireAuth,
  requireParent,
  validate(validateVoid),
  async (c) => {
    try {
      const id = c.req.param('id');
      const { voidReason } = getValidatedBody(c);
      const voidedBy = getAuthUserId(c);
      
      // ... existing handler (use voidReason and voidedBy from context)
    } catch (error) {
      console.error('Void event error:', error);
      return c.json({ error: 'Failed to void event', details: String(error) }, 500);
    }
  }
);

// Get events for child
app.get(
  "/make-server-f116e23f/children/:childId/events",
  requireAuth,
  requireFamilyAccess,
  async (c) => {
    // ... existing handler
  }
);
```

---

### **5. Invites Routes (Update invitedBy)**

```typescript
// Create family invite
app.post(
  "/make-server-f116e23f/families/:familyId/invites",
  requireAuth,
  requireParent,
  requireFamilyAccess,
  validate(validateInvite),
  async (c) => {
    try {
      const { familyId } = c.req.param();
      const { email } = getValidatedBody(c);
      const invitedBy = getAuthUserId(c); // ← From context, not body
      
      const { inviteCode, expiresAt } = await createInvite(familyId, email, invitedBy);
      
      console.log(`Invite created: ${inviteCode} for ${email} to join family ${familyId}`);
      
      return c.json({
        success: true,
        inviteCode,
        expiresAt,
        email,
        familyId,
        message: `Invite code: ${inviteCode} (expires in 72 hours)`
      });
    } catch (error) {
      console.error('Create invite error:', error);
      return c.json({ error: 'Failed to create invite', details: String(error) }, 500);
    }
  }
);

// Get family invites
app.get(
  "/make-server-f116e23f/families/:familyId/invites",
  requireAuth,
  requireParent,
  requireFamilyAccess,
  async (c) => {
    // ... existing handler
  }
);

// Accept invite (public)
app.post(
  "/make-server-f116e23f/invites/accept",
  validate(validateInviteAccept),
  async (c) => {
    // ... existing handler
  }
);

// Revoke invite
app.post(
  "/make-server-f116e23f/invites/:code/revoke",
  requireAuth,
  requireParent,
  async (c) => {
    // ... existing handler
  }
);
```

---

## 🚀 Quick Application Strategy

### **Step 1**: Replace route definitions (systematic find-replace)

```typescript
// FIND:
app.post("/make-server-f116e23f/events", async (c) => {

// REPLACE WITH:
app.post(
  "/make-server-f116e23f/events",
  requireAuth,
  requireParent,
  validate(validatePointEvent),
  async (c) => {
```

### **Step 2**: Update handler bodies

```typescript
// FIND:
const eventData = await c.req.json();

// REPLACE WITH:
const eventData = getValidatedBody(c);
const userId = getAuthUserId(c);
```

### **Step 3**: Test critical paths

```bash
# Test 1: Kid blocked from logging events
curl -X POST /events \
  -H "Authorization: Bearer kid_abc..." \
  -d '{"childId":"child123", ...}' \
  → Expected: 403 Forbidden

# Test 2: Parent can log events
curl -X POST /events \
  -H "Authorization: Bearer eyJhb..." \
  -d '{"childId":"child123", ...}' \
  → Expected: 200 OK

# Test 3: Validation works
curl -X POST /events \
  -H "Authorization: Bearer eyJhb..." \
  -d '{"childId":"child123", "points":99999}' \
  → Expected: 400 with validation errors
```

---

## ✅ Definition of Done

- [ ] All 21 parent-only routes protected
- [ ] All 15 kid-accessible routes protected
- [ ] All 3 public routes have appropriate validation
- [ ] Kid token returns 403 on parent endpoints
- [ ] Parent JWT works on all endpoints
- [ ] Validation errors return 400 with details
- [ ] Manual curl tests pass

---

**Estimated Time**: 2-3 hours  
**Impact**: Closes all authorization gaps → 7/7 for Backend Authorization  

---

**Ready to apply!** Use this guide to systematically update index.tsx.
