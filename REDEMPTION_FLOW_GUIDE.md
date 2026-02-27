# 🎁 Redemption Flow - Complete Guide

**Family Growth System - Reward Redemption System**

---

## 📋 Overview

The FGS uses a **Request-Approve-Deliver workflow** for kid reward redemptions. Kids can't directly redeem rewards - they must request permission from parents first. This maintains parental control and prevents unauthorized spending.

---

## 🔄 Complete Flow

### **Phase 1: Kid Requests Reward** 👶

**Where:** Kid Dashboard (`/dashboard`)

1. **Kid logs in** with their PIN
2. **Navigates to Kid Dashboard** - sees "My Wishlist" section
3. **Views affordable rewards** (≥50% points accumulated)
4. **Clicks "Ask Parent"** on a reward card
5. **Opens dialog** - can add optional message (e.g., "Please can we go after Jummah? 🥺")
6. **Sends request** - creates pending redemption request
7. **Sees "Waiting for parent..."** status on that reward

**Key Points:**
- ✅ Kid can only request if they have enough points
- ✅ Kid can add personal note/message
- ✅ Request shows as "pending" immediately
- ✅ Kid cannot submit duplicate requests for same reward
- ✅ No points are deducted yet

---

### **Phase 2: Parent Reviews Request** 👨‍👩‍👧

**Where:** Parent Dashboard → Redemption Requests (`/redemption-requests`)

1. **Parent logs in** (email/password)
2. **Sees notification badge** if pending requests exist
3. **Navigates to Redemption Requests** page
4. **Views pending request** with:
   - Child name & avatar
   - Reward name & description
   - Point cost
   - Kid's optional message
   - Request date
5. **Parent decides:**
   - **Option A: Approve** → Deducts points, moves to "To Deliver" tab
   - **Option B: Decline** → Opens dialog, must provide reason (≥5 characters)

**Key Points:**
- ✅ Parent sees all pending requests from all children
- ✅ Parent must confirm approval (points will be deducted)
- ✅ Parent must provide reason for decline
- ✅ Decline reason is shown to kid (gentle message)
- ✅ Points are only deducted when approved, not when requested

---

### **Phase 3: Approval & Points Deduction** ✅

**What Happens When Parent Approves:**

1. **System checks** child still has enough points
2. **Deducts points** from child's balance
3. **Creates point event** with negative points (`-50 pts - Redeemed: Ice Cream Trip`)
4. **Updates request status** to `approved`
5. **Records approval metadata:**
   - `approvedBy`: Parent user ID
   - `approvedAt`: Timestamp
6. **Shows new balance** in toast notification
7. **Moves request** to "To Deliver" tab

**Backend Logic:**
```typescript
// 1. Verify child has points
if (child.currentPoints < request.pointCost) {
  return error('Child no longer has enough points');
}

// 2. Deduct points
newPoints = child.currentPoints - request.pointCost;
child.currentPoints = newPoints;

// 3. Log point event
createEvent({
  childId,
  points: -request.pointCost,
  notes: `Redeemed: ${request.rewardName}`,
  isRedemption: true
});

// 4. Update request
request.status = 'approved';
request.approvedBy = parentUserId;
request.approvedAt = NOW;
```

---

### **Phase 4: Parent Delivers Reward** 🎉

**Where:** Redemption Requests → "To Deliver" tab

1. **Parent physically delivers** the reward (e.g., takes kid for ice cream)
2. **Returns to app** → "To Deliver" tab
3. **Clicks "Mark as Delivered"** on the request
4. **Confirms delivery**
5. **Request moves** to "Delivered" tab
6. **Status updated** to `delivered`

**Key Points:**
- ✅ Separate step from approval
- ✅ Parent controls when reward is actually given
- ✅ Delivery timestamp tracked
- ✅ Cannot mark as delivered before approval

---

### **Phase 5: Decline Handling** ❌

**What Happens When Parent Declines:**

1. **Parent clicks "Decline"**
2. **Dialog opens** - must enter reason
3. **Parent provides gentle reason:**
   - Good: "Let's wait until the weekend, sweetie! 😊"
   - Good: "Maybe next month after your exams, insha'Allah 📚"
   - Bad: "No" (too short, rejected)
4. **Request updated:**
   - Status: `declined`
   - Decline reason saved
   - Timestamp recorded
5. **Points remain** with child (nothing deducted)
6. **Kid can see** decline reason (if they check)

**Key Points:**
- ✅ Reason must be ≥5 characters
- ✅ Encourages kind, explanatory messages
- ✅ Points never deducted on decline
- ✅ Request archived in "Declined" tab

---

## 🎯 UI Components

### **Kid Side:**

#### **1. RewardRequestCard** (`/src/app/components/kid-mode/RewardRequestCard.tsx`)

**Visual States:**

**A. Locked (Not Enough Points)**
```
┌─────────────────────────────┐
│  🔒 Reward Name      [50pts]│
│  Description                │
│  ▓▓▓▓▓░░░░░░░ 40% (10 more!)│
│  [ Keep earning! ]          │
└─────────────────────────────┘
```

**B. Can Afford (Ready to Request)**
```
┌─────────────────────────────┐
│  🎁 Reward Name      [50pts]│
│  Description                │
│                             │
│  [ 📤 Ask Parent ]          │
└─────────────────────────────┘
```

**C. Pending Request**
```
┌─────────────────────────────┐
│  🎁 Reward Name      [50pts]│
│  Description                │
│  ⏰ Waiting for parent...   │
│                             │
└─────────────────────────────┘
```

#### **2. Request Dialog**
```
╔═══════════════════════════════╗
║  🎁 Ask for Ice Cream Trip?  ║
╟───────────────────────────────╢
║  This will send a request to  ║
║  your parents. You can add a  ║
║  special message if you'd     ║
║  like!                        ║
║                               ║
║  Your Message (Optional) 💬   ║
║  ┌───────────────────────┐   ║
║  │ Please can we go      │   ║
║  │ after Jummah? 🥺      │   ║
║  └───────────────────────┘   ║
║  35/200 characters            ║
║                               ║
║  [Cancel]  [📤 Send Request]  ║
╚═══════════════════════════════╝
```

---

### **Parent Side:**

#### **1. Pending Request Card**
```
┌─────────────────────────────────────┐
│  👧 Alice                    [50pts]│
│  Ice Cream Trip                     │
│  "Please can we go after Jummah?"   │
│                                     │
│  Requested Jan 20, 2026             │
│                                     │
│  [✅ Approve]    [❌ Decline]        │
└─────────────────────────────────────┘
```

#### **2. Approved Request (To Deliver)**
```
┌─────────────────────────────────────┐
│  👧 Alice                    [50pts]│
│  Ice Cream Trip                     │
│                                     │
│  ✅ Approved                        │
│  Approved on Jan 20, 2026           │
│                                     │
│  [📦 Mark as Delivered]             │
└─────────────────────────────────────┘
```

#### **3. Decline Dialog**
```
╔═══════════════════════════════════╗
║  Decline Request                 ║
╟──────────────────────────────────╢
║  Please provide a gentle reason  ║
║  for declining this request.     ║
║  This will be shown to Alice.    ║
║                                  ║
║  ┌──────────────────────────┐   ║
║  │ Let's wait until the     │   ║
║  │ weekend, sweetie! 😊     │   ║
║  └──────────────────────────┘   ║
║  42/200 characters (min. 5)      ║
║                                  ║
║  [Cancel]  [Decline Request]     ║
╚═══════════════════════════════════╝
```

---

## 🔐 Security & Validation

### **Request Creation:**
- ✅ Child must have `currentPoints >= reward.pointCost`
- ✅ Both child and reward must exist
- ✅ Request linked to child's family
- ✅ Authenticated user required (kid or parent)

### **Approval:**
- ✅ **Parent role required** (`requireParent` middleware)
- ✅ Must be in same family as child
- ✅ Re-validates points before deduction
- ✅ Status must be `pending` (can't approve twice)
- ✅ Atomic operation (points + event + status update)

### **Decline:**
- ✅ **Parent role required**
- ✅ Reason ≥5 characters (enforced client & server)
- ✅ Status must be `pending`

### **Delivery:**
- ✅ **Parent role required**
- ✅ Status must be `approved` (can't skip approval)
- ✅ Records delivery timestamp

---

## 📊 Data Model

### **Redemption Request Object:**
```typescript
{
  id: 'redemption:uuid',
  childId: 'child:xxx',
  rewardId: 'reward:yyy',
  familyId: 'family:zzz',
  
  // Reward snapshot
  pointCost: 50,
  rewardName: 'Ice Cream Trip',
  rewardDescription: 'Trip to favorite ice cream shop',
  
  // Request info
  notes: 'Please can we go after Jummah?',
  requestedBy: 'user-uuid',
  requestedAt: '2026-01-20T14:30:00Z',
  
  // Status workflow
  status: 'pending' | 'approved' | 'declined' | 'delivered',
  
  // Approval
  approvedBy: 'user-uuid' | null,
  approvedAt: '2026-01-20T15:00:00Z' | null,
  
  // Decline
  declinedBy: 'user-uuid' | null,
  declinedAt: '2026-01-20T15:00:00Z' | null,
  declineReason: 'Let\'s wait until weekend!' | null,
  
  // Delivery
  deliveredBy: 'user-uuid' | null,
  deliveredAt: '2026-01-21T12:00:00Z' | null
}
```

---

## 🧪 Testing the Flow

### **Manual Test Script:**

**Step 1: Setup** (Run in browser console after logging in as parent)

```javascript
// Create test child with points
const familyId = localStorage.getItem('fgs_family_id');
const token = (await supabase.auth.getSession()).data.session.access_token;

// Create child
const childRes = await fetch(`${API_BASE}/families/${familyId}/children`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Test Alice',
    pin: '1111',
    avatar: '👧'
  })
});
const child = await childRes.json();
console.log('Created child:', child.id);

// Give child 100 points
await fetch(`${API_BASE}/point-events`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    childId: child.id,
    points: 100,
    description: 'Test setup points'
  })
});

console.log('✅ Setup complete! Child has 100 points');
```

**Step 2: Kid Requests Reward**

1. **Sign out** from parent account
2. **Navigate to** `/kid-login-new`
3. **Enter family code** (from parent dashboard)
4. **Select "Test Alice"**
5. **Enter PIN:** `1111`
6. **On Kid Dashboard:**
   - Scroll to "My Wishlist" section
   - Find a reward worth ≤100 points
   - Click **"Ask Parent"** button
   - Add message: "Please please please! 🥺"
   - Click **"Send Request"**
7. **Verify:** Card now shows "⏰ Waiting for parent..."

**Step 3: Parent Approves**

1. **Sign out** from kid session
2. **Login as parent**
3. **Navigate to** `/redemption-requests`
4. **See pending request** with:
   - Alice's name
   - Reward name
   - Points cost
   - Kid's message
5. **Click "Approve"**
6. **Confirm** dialog
7. **Verify toast:** "✅ Approved! Alice's new balance: XX points"
8. **Check "To Deliver" tab** - request should be there

**Step 4: Parent Marks Delivered**

1. **In "To Deliver" tab**
2. **Click "Mark as Delivered"**
3. **Confirm**
4. **Verify:** Request moves to "Delivered" tab
5. **Verify toast:** "🎉 Marked as delivered!"

**Step 5: Verify Points Deducted**

```javascript
// Check child's current points
const checkRes = await fetch(`${API_BASE}/children/${child.id}`, {
  headers: { 'Authorization': `Bearer ${token}` }
});
const updatedChild = await checkRes.json();

console.log('Points before:', 100);
console.log('Points after:', updatedChild.currentPoints);
console.log('Expected:', 100 - rewardPointCost);
console.log('Match:', updatedChild.currentPoints === (100 - rewardPointCost) ? '✅' : '❌');
```

---

### **Test Decline Flow:**

**Alternative to Step 3:**

1. **On pending request** click **"Decline"**
2. **Dialog opens**
3. **Try short reason:** "No" → Error: "min. 5 characters"
4. **Enter proper reason:** "Let's wait until the weekend, sweetie! 😊"
5. **Click "Decline Request"**
6. **Verify:**
   - Request moves to "Declined" tab
   - Shows decline reason
   - Points NOT deducted from child

---

## 🚨 Edge Cases Handled

### **1. Points Changed After Request**

**Scenario:** Kid requests 50pt reward, parent spends time reviewing, meanwhile parent deducts 10pts for misbehavior.

**Handling:**
```typescript
// On approval, system re-checks points
if (child.currentPoints < request.pointCost) {
  return error('Child no longer has enough points');
}
```

**Result:** Approval fails with clear error message.

---

### **2. Duplicate Requests**

**Scenario:** Kid spams "Ask Parent" button.

**Handling:**
```typescript
const isPending = pendingRequests.some(req => req.rewardId === reward.id);

{isPending ? (
  <div>⏰ Waiting for parent...</div>
) : (
  <Button onClick={handleRequest}>Ask Parent</Button>
)}
```

**Result:** Button replaced with "Waiting" message if request already pending.

---

### **3. Parent Tries to Approve Twice**

**Scenario:** Two parents try to approve same request simultaneously.

**Handling:**
```typescript
if (request.status !== 'pending') {
  return error('Request is no longer pending');
}
```

**Result:** Second approval fails gracefully.

---

### **4. Deleted Reward/Child**

**Scenario:** Reward deleted after request created.

**Handling:**
- Request stores reward snapshot (`rewardName`, `pointCost`, etc.)
- Original reward can be deleted without breaking request
- Request history preserved

---

## 📈 Future Enhancements

### **Phase 1 (Current):** ✅ COMPLETE
- [x] Kid request workflow
- [x] Parent approve/decline
- [x] Points deduction on approval
- [x] Delivery tracking
- [x] Request history

### **Phase 2 (Nice to Have):**
- [ ] Real-time notifications (parent gets alert when kid requests)
- [ ] Auto-approve for small rewards (<25 points)
- [ ] Reward scheduling (approve now, deliver later with date picker)
- [ ] Reward photos (parent uploads photo of kid enjoying reward)
- [ ] Kid can see request status on dashboard (approved/declined notifications)

### **Phase 3 (Advanced):**
- [ ] Reward redemption limits (1 per week, etc.)
- [ ] Conditional rewards (only on weekends, only after homework)
- [ ] Multi-parent approval (both parents must approve)
- [ ] Reward packages (bundle multiple small rewards)

---

## ✅ System Status

**Current Implementation Status:** ✅ **FULLY FUNCTIONAL**

- ✅ Kid request creation
- ✅ Parent approval workflow
- ✅ Points deduction
- ✅ Decline with reason
- ✅ Delivery tracking
- ✅ Request history (4 tabs: Pending, To Deliver, Delivered, Declined)
- ✅ Security (parent-only operations)
- ✅ Validation (points check, status checks)
- ✅ UI (kid cards, parent dashboard, dialogs)
- ✅ Backend API (all 4 endpoints)
- ✅ Real-time updates (30-second polling on kid side)

**Ready for Production:** ✅ YES

---

## 🎓 Quick Reference

### **API Endpoints:**

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/redemption-requests` | POST | Kid/Parent | Create request |
| `/families/:id/redemption-requests` | GET | Parent | List all requests |
| `/redemption-requests/:id/approve` | POST | Parent | Approve & deduct points |
| `/redemption-requests/:id/decline` | POST | Parent | Decline with reason |
| `/redemption-requests/:id/deliver` | POST | Parent | Mark delivered |

### **Status Flow:**

```
pending → approved → delivered
   ↓
declined
```

### **Key Files:**

```
Frontend:
  /src/app/pages/KidDashboard.tsx              ← Kid view & request logic
  /src/app/components/kid-mode/RewardRequestCard.tsx  ← Request card UI
  /src/app/pages/PendingRedemptionRequests.tsx ← Parent management

Backend:
  /supabase/functions/server/index.tsx         ← Lines 3579-3829
```

---

**Last Updated:** February 20, 2026  
**Status:** Production Ready ✅  
**Version:** 1.0.0
