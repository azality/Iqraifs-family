# 📚 FAMILY GROWTH SYSTEM - API DOCUMENTATION

**Version:** 1.0.2  
**Last Updated:** February 21, 2026  
**Base URL:** `https://{projectId}.supabase.co/functions/v1/make-server-f116e23f`

---

## 📋 TABLE OF CONTENTS

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Endpoints by Category](#endpoints-by-category)
   - [Health & System](#health--system)
   - [Authentication & Users](#authentication--users)
   - [Families](#families)
   - [Children](#children)
   - [Kid Authentication](#kid-authentication)
   - [Events & Tracking](#events--tracking)
   - [Quests & Challenges](#quests--challenges)
   - [Rewards & Wishlist](#rewards--wishlist)
   - [Redemptions](#redemptions)
   - [Attendance & Providers](#attendance--providers)
   - [Trackable Items & Milestones](#trackable-items--milestones)
   - [Quizzes](#quizzes)
   - [Invites](#invites)
   - [Admin](#admin)
4. [Error Handling](#error-handling)
5. [Rate Limiting](#rate-limiting)
6. [Data Models](#data-models)

---

## 🎯 OVERVIEW

The Family Growth System API is a RESTful API built with Hono on Supabase Edge Functions. It provides comprehensive family behavior tracking, quest management, and reward systems.

**Key Features:**
- ✅ JWT-based authentication (Supabase Auth)
- ✅ Role-based access control (Parent/Child)
- ✅ Family-scoped data isolation
- ✅ Rate limiting on sensitive endpoints
- ✅ Comprehensive input validation
- ✅ Audit trail for all mutations

---

## 🔐 AUTHENTICATION

### Authentication Methods

**1. Parent Authentication** (Supabase JWT)
```http
Authorization: Bearer {access_token}
```

**2. Kid Authentication** (Custom Kid Session Token)
```http
Authorization: Bearer {kid_access_token}
```

**3. Public Endpoints** (No auth required)
```http
apikey: {supabase_anon_key}
```

### Getting Access Tokens

#### Parent Login
```javascript
// Use Supabase Auth client
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'parent@example.com',
  password: 'password123'
});

const accessToken = data.session.access_token;
```

#### Kid Login
```http
POST /kid/login
Content-Type: application/json

{
  "familyCode": "XKNN5U",
  "childId": "child:123",
  "pin": "1234"
}

Response:
{
  "success": true,
  "kidAccessToken": "...",
  "child": { ... },
  "family": { ... }
}
```

---

## 📡 ENDPOINTS BY CATEGORY

---

## 🏥 HEALTH & SYSTEM

### GET /health

Health check endpoint.

**Auth:** None  
**Returns:** API status

```http
GET /health

Response: 200
{
  "status": "ok"
}
```

---

### GET /admin/system-stats

Get system statistics (admin only).

**Auth:** Required (Parent)  
**Returns:** System metrics

```http
GET /admin/system-stats
Authorization: Bearer {access_token}

Response: 200
{
  "totalFamilies": 42,
  "totalChildren": 156,
  "totalEvents": 8432,
  "totalPoints": 125600
}
```

---

## 👤 AUTHENTICATION & USERS

### POST /auth/signup

Create new parent account.

**Auth:** None  
**Rate Limit:** 5 signups / hour / IP  
**Body:**
```json
{
  "email": "parent@example.com",
  "password": "SecurePassword123!",
  "name": "John Doe",
  "role": "parent"
}
```

**Response:** 200
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "parent@example.com",
    "user_metadata": {
      "name": "John Doe",
      "role": "parent"
    }
  }
}
```

**Errors:**
- `400` - Email already exists
- `400` - Password too weak
- `429` - Rate limited

---

### GET /users/:userId

Get user profile by ID.

**Auth:** Required (must be same user)  
**Returns:** User data

```http
GET /users/uuid-123
Authorization: Bearer {access_token}

Response: 200
{
  "id": "uuid-123",
  "email": "parent@example.com",
  "name": "John Doe",
  "role": "parent",
  "createdAt": "2026-02-21T00:00:00Z"
}
```

**Errors:**
- `403` - Unauthorized (accessing another user)
- `404` - User not found

---

## 👨‍👩‍👧‍👦 FAMILIES

### POST /families

Create a new family.

**Auth:** Required (Parent)  
**Body:**
```json
{
  "name": "The Smiths",
  "parentIds": ["uuid-123"]
}
```

**Response:** 200
```json
{
  "family": {
    "id": "family:1234567890",
    "name": "The Smiths",
    "parentIds": ["uuid-123"],
    "inviteCode": "ABC123",
    "createdAt": "2026-02-21T00:00:00Z"
  }
}
```

---

### GET /families

Get all families for authenticated user.

**Auth:** Required (Parent)  
**Returns:** Array of families

```http
GET /families
Authorization: Bearer {access_token}

Response: 200
[
  {
    "id": "family:1234567890",
    "name": "The Smiths",
    "parentIds": ["uuid-123"],
    "inviteCode": "ABC123",
    "children": [...],
    "createdAt": "2026-02-21T00:00:00Z"
  }
]
```

---

### GET /families/:id

Get family by ID.

**Auth:** Required (must have family access)  
**Returns:** Family details

```http
GET /families/family:1234567890
Authorization: Bearer {access_token}

Response: 200
{
  "id": "family:1234567890",
  "name": "The Smiths",
  "parentIds": ["uuid-123", "uuid-456"],
  "inviteCode": "ABC123",
  "children": [
    {
      "id": "child:111",
      "name": "Alice",
      "age": 8,
      "points": 450
    }
  ],
  "createdAt": "2026-02-21T00:00:00Z"
}
```

**Errors:**
- `403` - Not a member of this family
- `404` - Family not found

---

### GET /families/:familyId/children

Get children for a family (authenticated).

**Auth:** Required (must have family access)  
**Returns:** Array of children

```http
GET /families/family:123/children
Authorization: Bearer {access_token}

Response: 200
[
  {
    "id": "child:111",
    "name": "Alice",
    "age": 8,
    "avatar": "avatar1",
    "points": 450,
    "createdAt": "2026-02-21T00:00:00Z"
  }
]
```

---

### GET /public/families/:familyId/children

Get children for family code validation (public, no PIN).

**Auth:** None (Public)  
**Returns:** Children without sensitive data

```http
GET /public/families/family:123/children

Response: 200
[
  {
    "id": "child:111",
    "childId": "child:111",
    "name": "Alice",
    "avatar": "avatar1"
  }
]
```

**Note:** Does NOT include PIN, points, or other sensitive data.

---

### POST /public/verify-family-code

Verify family code and get basic family info.

**Auth:** None (Public)  
**Body:**
```json
{
  "familyCode": "ABC123"
}
```

**Response:** 200
```json
{
  "valid": true,
  "familyId": "family:123",
  "familyName": "The Smiths"
}
```

**Errors:**
- `404` - Invalid family code (no enumeration hints)

---

### POST /families/:id/generate-invite-code

Generate or regenerate family invite code.

**Auth:** Required (Parent with family access)  
**Returns:** New invite code

```http
POST /families/family:123/generate-invite-code
Authorization: Bearer {access_token}

Response: 200
{
  "inviteCode": "XYZ789",
  "message": "Invite code generated successfully"
}
```

---

### POST /families/join

Join family using invite code (instant join).

**Auth:** Required (Parent)  
**Body:**
```json
{
  "inviteCode": "ABC123"
}
```

**Response:** 200
```json
{
  "success": true,
  "family": {
    "id": "family:123",
    "name": "The Smiths"
  }
}
```

**Errors:**
- `404` - Invalid invite code
- `409` - Already a member

---

### POST /families/join-request

Submit join request (requires admin approval).

**Auth:** Required (Parent)  
**Body:**
```json
{
  "inviteCode": "ABC123"
}
```

**Response:** 200
```json
{
  "success": true,
  "requestId": "request:123",
  "status": "pending"
}
```

---

### GET /families/:familyId/join-requests

Get pending join requests for family (admin only).

**Auth:** Required (Parent, must be admin)  
**Returns:** Array of pending requests

```http
GET /families/family:123/join-requests
Authorization: Bearer {access_token}

Response: 200
[
  {
    "id": "request:123",
    "familyId": "family:123",
    "userId": "uuid-789",
    "userName": "Jane Doe",
    "userEmail": "jane@example.com",
    "status": "pending",
    "createdAt": "2026-02-21T00:00:00Z"
  }
]
```

---

### POST /families/:familyId/join-requests/:requestId/approve

Approve join request (admin only).

**Auth:** Required (Parent, must be admin)  
**Returns:** Success

```http
POST /families/family:123/join-requests/request:456/approve
Authorization: Bearer {access_token}

Response: 200
{
  "success": true,
  "message": "Join request approved",
  "family": { ... }
}
```

---

### POST /families/:familyId/join-requests/:requestId/deny

Deny join request (admin only).

**Auth:** Required (Parent, must be admin)  
**Returns:** Success

```http
POST /families/family:123/join-requests/request:456/deny
Authorization: Bearer {access_token}

Response: 200
{
  "success": true,
  "message": "Join request denied"
}
```

---

### GET /auth/my-join-request

Get user's own pending join request.

**Auth:** Required (Parent)  
**Returns:** Join request or null

```http
GET /auth/my-join-request
Authorization: Bearer {access_token}

Response: 200
{
  "id": "request:123",
  "familyId": "family:456",
  "familyName": "The Smiths",
  "status": "pending",
  "createdAt": "2026-02-21T00:00:00Z"
}
```

---

### GET /families/:familyId/users

Get family users (parents) for audit trail.

**Auth:** Required (must have family access)  
**Returns:** Array of family parents

```http
GET /families/family:123/users
Authorization: Bearer {access_token}

Response: 200
[
  {
    "id": "uuid-123",
    "name": "John Doe",
    "email": "john@example.com"
  },
  {
    "id": "uuid-456",
    "name": "Jane Doe",
    "email": "jane@example.com"
  }
]
```

---

## 👶 CHILDREN

### POST /children

Create a new child.

**Auth:** Required (Parent with family access)  
**Body:**
```json
{
  "name": "Alice",
  "familyId": "family:123",
  "pin": "1234",
  "age": 8,
  "avatar": "avatar1"
}
```

**Response:** 200
```json
{
  "child": {
    "id": "child:111",
    "childId": "child:111",
    "name": "Alice",
    "familyId": "family:123",
    "age": 8,
    "avatar": "avatar1",
    "points": 0,
    "createdAt": "2026-02-21T00:00:00Z"
  }
}
```

**Validation:**
- PIN must be 4 digits
- Name required
- Age must be 1-18

---

### GET /children/:childId

Get child by ID.

**Auth:** Required (must have child access)  
**Returns:** Child details

```http
GET /children/child:111
Authorization: Bearer {access_token}

Response: 200
{
  "id": "child:111",
  "childId": "child:111",
  "name": "Alice",
  "familyId": "family:123",
  "age": 8,
  "avatar": "avatar1",
  "points": 450,
  "createdAt": "2026-02-21T00:00:00Z"
}
```

**Note:** PIN is never returned in responses.

---

### PATCH /children/:id

Update child (points or other fields).

**Auth:** Required (Parent with child access)  
**Body:**
```json
{
  "points": 500
}
```

**Response:** 200
```json
{
  "child": {
    "id": "child:111",
    "points": 500,
    "updatedAt": "2026-02-21T00:00:00Z"
  }
}
```

---

### POST /children/:id/verify-pin

Verify child PIN (for edit requests, not login).

**Auth:** Required (Parent with child access)  
**Rate Limit:** 3 attempts / 5 min / child+IP  
**Body:**
```json
{
  "pin": "1234"
}
```

**Response:** 200
```json
{
  "valid": true
}
```

**Response:** 401 (invalid PIN)
```json
{
  "valid": false,
  "error": "Invalid PIN"
}
```

**Response:** 429 (locked out)
```json
{
  "valid": false,
  "locked": true,
  "lockedUntil": "2026-02-21T01:15:00Z",
  "error": "Account locked due to too many failed attempts"
}
```

---

## 🎮 KID AUTHENTICATION

### POST /kid/login

Authenticate kid using family code + child ID + PIN.

**Auth:** None (Public)  
**Rate Limit:** Soft limit (PIN has its own lockout)  
**Body:**
```json
{
  "familyCode": "ABC123",
  "childId": "child:111",
  "pin": "1234"
}
```

**Response:** 200
```json
{
  "success": true,
  "kidAccessToken": "eyJhbGci...",
  "child": {
    "id": "child:111",
    "name": "Alice",
    "avatar": "avatar1",
    "points": 450
  },
  "family": {
    "id": "family:123",
    "name": "The Smiths"
  }
}
```

**Errors:**
- `400` - Missing required fields
- `401` - Invalid PIN
- `404` - Family code not found
- `404` - Child not found
- `429` - PIN locked (5 failed attempts → 15min lockout)

**Security:**
- PIN attempts tracked per child+IP
- 5 failed attempts → 15 minute lockout
- No enumeration hints (same error for invalid code/child)

---

## 📊 EVENTS & TRACKING

### POST /events

Log a behavior event (parent or system).

**Auth:** Required (Parent with child access)  
**Rate Limit:** 30 events / min / user  
**Body:**
```json
{
  "childId": "child:111",
  "type": "prayer",
  "points": 5,
  "timestamp": "2026-02-21T12:00:00Z",
  "metadata": {
    "note": "Fajr prayer on time",
    "category": "worship"
  }
}
```

**Response:** 200
```json
{
  "event": {
    "id": "event:123",
    "childId": "child:111",
    "type": "prayer",
    "points": 5,
    "timestamp": "2026-02-21T12:00:00Z",
    "createdBy": "uuid-parent",
    "metadata": { ... },
    "voided": false,
    "createdAt": "2026-02-21T12:00:00Z"
  }
}
```

**Validation:**
- `type` required (string)
- `points` required (number)
- `childId` must exist and user must have access

---

### GET /children/:childId/events

Get all events for a child.

**Auth:** Required (must have child access)  
**Query Params:**
- `limit` (optional): Max results (default: 100)
- `offset` (optional): Pagination offset
- `from` (optional): Filter events after date
- `to` (optional): Filter events before date

```http
GET /children/child:111/events?limit=50&from=2026-02-01
Authorization: Bearer {access_token}

Response: 200
[
  {
    "id": "event:123",
    "childId": "child:111",
    "type": "prayer",
    "points": 5,
    "timestamp": "2026-02-21T12:00:00Z",
    "createdBy": "uuid-parent",
    "createdByName": "John Doe",
    "voided": false,
    "metadata": { ... }
  }
]
```

---

### POST /events/:id/void

Void (soft delete) an event.

**Auth:** Required (Parent with access to event's child)  
**Body:**
```json
{
  "reason": "Entered by mistake"
}
```

**Response:** 200
```json
{
  "success": true,
  "event": {
    "id": "event:123",
    "voided": true,
    "voidedAt": "2026-02-21T12:00:00Z",
    "voidedBy": "uuid-parent",
    "voidReason": "Entered by mistake"
  }
}
```

**Note:** Events are never hard-deleted (audit trail integrity).

---

## 🗺️ QUESTS & CHALLENGES

### GET /families/:familyId/quest-settings

Get quest configuration for family.

**Auth:** Required (must have family access)  
**Returns:** Quest settings

```http
GET /families/family:123/quest-settings
Authorization: Bearer {access_token}

Response: 200
{
  "questsEnabled": true,
  "dailyQuestCount": 3,
  "questDifficulty": "medium",
  "allowCustomQuests": true
}
```

---

### PUT /families/:familyId/quest-settings

Update quest configuration.

**Auth:** Required (Parent with family access)  
**Body:**
```json
{
  "questsEnabled": true,
  "dailyQuestCount": 5,
  "questDifficulty": "hard"
}
```

**Response:** 200
```json
{
  "success": true,
  "settings": { ... }
}
```

---

### POST /families/:familyId/custom-quests

Create custom quest template.

**Auth:** Required (Parent with family access)  
**Body:**
```json
{
  "title": "Master of Prayers",
  "description": "Complete all 5 daily prayers for 7 days",
  "difficulty": "hard",
  "pointsReward": 50,
  "requirements": [
    {
      "type": "prayer",
      "count": 35,
      "timeframe": "week"
    }
  ]
}
```

**Response:** 200
```json
{
  "quest": {
    "id": "quest:custom:123",
    "familyId": "family:123",
    "title": "Master of Prayers",
    "difficulty": "hard",
    "pointsReward": 50,
    "active": true,
    "createdAt": "2026-02-21T00:00:00Z"
  }
}
```

---

### GET /families/:familyId/custom-quests

Get all custom quests for family.

**Auth:** Required (must have family access)  
**Returns:** Array of custom quests

```http
GET /families/family:123/custom-quests
Authorization: Bearer {access_token}

Response: 200
[
  {
    "id": "quest:custom:123",
    "title": "Master of Prayers",
    "difficulty": "hard",
    "pointsReward": 50,
    "active": true
  }
]
```

---

### PUT /families/:familyId/custom-quests/:questId

Update custom quest.

**Auth:** Required (Parent with family access)  
**Body:**
```json
{
  "active": false
}
```

**Response:** 200
```json
{
  "success": true,
  "quest": { ... }
}
```

---

### DELETE /families/:familyId/custom-quests/:questId

Delete custom quest.

**Auth:** Required (Parent with family access)  
**Returns:** Success

```http
DELETE /families/family:123/custom-quests/quest:456
Authorization: Bearer {access_token}

Response: 200
{
  "success": true
}
```

---

### POST /children/:childId/challenges/generate

Generate daily challenges (quests) for child.

**Auth:** Required (Parent or Kid with child access)  
**Returns:** Generated challenges

```http
POST /children/child:111/challenges/generate
Authorization: Bearer {access_token}

Response: 200
{
  "challenges": [
    {
      "id": "challenge:123",
      "childId": "child:111",
      "title": "Prayer Warrior",
      "description": "Complete 3 prayers today",
      "type": "prayer",
      "targetCount": 3,
      "currentCount": 0,
      "pointsReward": 15,
      "difficulty": "easy",
      "expiresAt": "2026-02-22T00:00:00Z",
      "completed": false
    }
  ]
}
```

**Note:** Challenges are auto-generated based on family's configured behaviors.

---

### GET /children/:childId/challenges

Get active challenges for child.

**Auth:** Required (Parent or Kid with child access)  
**Returns:** Array of challenges

```http
GET /children/child:111/challenges
Authorization: Bearer {access_token}

Response: 200
[
  {
    "id": "challenge:123",
    "title": "Prayer Warrior",
    "currentCount": 2,
    "targetCount": 3,
    "progress": 66,
    "pointsReward": 15,
    "completed": false,
    "expiresAt": "2026-02-22T00:00:00Z"
  }
]
```

---

### GET /children/:childId/challenges/samples

Get sample quests for preview (empty state).

**Auth:** Required (must have child access)  
**Returns:** Sample challenges based on configured behaviors

```http
GET /children/child:111/challenges/samples
Authorization: Bearer {access_token}

Response: 200
[
  {
    "id": "sample:1",
    "title": "Prayer Champion",
    "description": "Complete 5 prayers",
    "type": "prayer",
    "pointsReward": 25,
    "difficulty": "medium"
  }
]
```

---

### POST /children/:childId/challenges/evaluate

Evaluate challenge completion (idempotent).

**Auth:** Required (Parent or Kid with child access)  
**Body:**
```json
{
  "challengeId": "challenge:123"
}
```

**Response:** 200
```json
{
  "challenge": {
    "id": "challenge:123",
    "completed": true,
    "completedAt": "2026-02-21T14:30:00Z",
    "pointsAwarded": 15
  },
  "childPoints": 465
}
```

**Note:** This endpoint is idempotent - calling multiple times won't award points twice.

---

### GET /children/:childId/challenge-analytics

Get challenge analytics for parent dashboard.

**Auth:** Required (Parent with child access)  
**Returns:** Challenge statistics

```http
GET /children/child:111/challenge-analytics
Authorization: Bearer {access_token}

Response: 200
{
  "totalChallenges": 45,
  "completedChallenges": 38,
  "completionRate": 84.4,
  "totalPointsEarned": 570,
  "currentStreak": 7,
  "longestStreak": 12
}
```

---

## 🎁 REWARDS & WISHLIST

### POST /rewards

Create a reward.

**Auth:** Required (Parent with family access)  
**Body:**
```json
{
  "familyId": "family:123",
  "name": "Extra Screen Time",
  "description": "30 minutes of extra iPad time",
  "pointsCost": 50,
  "category": "privilege",
  "imageUrl": "https://..."
}
```

**Response:** 200
```json
{
  "reward": {
    "id": "reward:123",
    "familyId": "family:123",
    "name": "Extra Screen Time",
    "pointsCost": 50,
    "available": true,
    "createdAt": "2026-02-21T00:00:00Z"
  }
}
```

---

### GET /rewards

Get all rewards for family.

**Auth:** Required (must have family access)  
**Query Params:**
- `familyId` (required): Family ID

```http
GET /rewards?familyId=family:123
Authorization: Bearer {access_token}

Response: 200
[
  {
    "id": "reward:123",
    "name": "Extra Screen Time",
    "description": "30 minutes extra",
    "pointsCost": 50,
    "available": true,
    "category": "privilege"
  }
]
```

---

### DELETE /rewards/:id

Delete a reward.

**Auth:** Required (Parent with family access)  
**Returns:** Success

```http
DELETE /rewards/reward:123
Authorization: Bearer {access_token}

Response: 200
{
  "success": true
}
```

---

### POST /wishlist-items

Create wishlist item (kid or parent).

**Auth:** Required (Parent or Kid with family access)  
**Body:**
```json
{
  "familyId": "family:123",
  "childId": "child:111",
  "itemName": "LEGO Star Wars Set",
  "itemDescription": "The big Millennium Falcon one",
  "estimatedPoints": 500,
  "imageUrl": "https://..."
}
```

**Response:** 200
```json
{
  "wishlistItem": {
    "id": "wishlist:123",
    "familyId": "family:123",
    "childId": "child:111",
    "itemName": "LEGO Star Wars Set",
    "estimatedPoints": 500,
    "status": "pending",
    "createdAt": "2026-02-21T00:00:00Z"
  }
}
```

---

### GET /families/:familyId/wishlist-items

Get wishlist items for family.

**Auth:** Required (must have family access)  
**Query Params:**
- `status` (optional): Filter by status (pending, approved, converted)

```http
GET /families/family:123/wishlist-items?status=pending
Authorization: Bearer {access_token}

Response: 200
[
  {
    "id": "wishlist:123",
    "childId": "child:111",
    "childName": "Alice",
    "itemName": "LEGO Star Wars Set",
    "estimatedPoints": 500,
    "status": "pending",
    "createdAt": "2026-02-21T00:00:00Z"
  }
]
```

---

### POST /wishlist-items/:id/convert

Convert wishlist item to reward (parent only).

**Auth:** Required (Parent with family access)  
**Body:**
```json
{
  "pointsCost": 500,
  "makeAvailable": true
}
```

**Response:** 200
```json
{
  "success": true,
  "reward": {
    "id": "reward:456",
    "name": "LEGO Star Wars Set",
    "pointsCost": 500,
    "available": true
  },
  "wishlistItem": {
    "id": "wishlist:123",
    "status": "converted",
    "convertedToRewardId": "reward:456"
  }
}
```

---

### DELETE /wishlist-items/:id

Delete wishlist item.

**Auth:** Required (Parent with family access)  
**Returns:** Success

```http
DELETE /wishlist-items/wishlist:123
Authorization: Bearer {access_token}

Response: 200
{
  "success": true
}
```

---

## 💰 REDEMPTIONS

### POST /redemption-requests

Create redemption request (kid requests to redeem reward).

**Auth:** Required (Parent or Kid with child access)  
**Body:**
```json
{
  "childId": "child:111",
  "rewardId": "reward:123",
  "quantity": 1
}
```

**Response:** 200
```json
{
  "redemptionRequest": {
    "id": "redemption:123",
    "childId": "child:111",
    "rewardId": "reward:123",
    "pointsCost": 50,
    "quantity": 1,
    "totalPoints": 50,
    "status": "pending",
    "createdAt": "2026-02-21T00:00:00Z"
  }
}
```

**Validation:**
- Child must have enough points
- Reward must be available
- Points are NOT deducted until approved

---

### GET /families/:familyId/redemption-requests

Get redemption requests for family.

**Auth:** Required (must have family access)  
**Query Params:**
- `status` (optional): pending, approved, declined, delivered
- `childId` (optional): Filter by child

```http
GET /families/family:123/redemption-requests?status=pending
Authorization: Bearer {access_token}

Response: 200
[
  {
    "id": "redemption:123",
    "childId": "child:111",
    "childName": "Alice",
    "rewardId": "reward:456",
    "rewardName": "Extra Screen Time",
    "pointsCost": 50,
    "status": "pending",
    "createdAt": "2026-02-21T00:00:00Z"
  }
]
```

---

### POST /redemption-requests/:id/approve

Approve redemption request (parent only).

**Auth:** Required (Parent with family access)  
**Body:** (optional)
```json
{
  "note": "Great job this week!"
}
```

**Response:** 200
```json
{
  "success": true,
  "redemption": {
    "id": "redemption:123",
    "status": "approved",
    "approvedAt": "2026-02-21T15:00:00Z",
    "approvedBy": "uuid-parent"
  },
  "child": {
    "id": "child:111",
    "points": 400,
    "pointsDeducted": 50
  }
}
```

**Effects:**
- Status → "approved"
- Child points deducted
- Ledger entry created
- Parent notified (if notifications enabled)

---

### POST /redemption-requests/:id/decline

Decline redemption request (parent only).

**Auth:** Required (Parent with family access)  
**Body:**
```json
{
  "reason": "Let's save up for something bigger"
}
```

**Response:** 200
```json
{
  "success": true,
  "redemption": {
    "id": "redemption:123",
    "status": "declined",
    "declinedAt": "2026-02-21T15:00:00Z",
    "declinedBy": "uuid-parent",
    "declineReason": "Let's save up for something bigger"
  }
}
```

**Effects:**
- Status → "declined"
- Points NOT deducted (remain available)
- Child can request again

---

### POST /redemption-requests/:id/deliver

Mark redemption as delivered (parent only).

**Auth:** Required (Parent with family access)  
**Body:** (optional)
```json
{
  "note": "Delivered after dinner"
}
```

**Response:** 200
```json
{
  "success": true,
  "redemption": {
    "id": "redemption:123",
    "status": "delivered",
    "deliveredAt": "2026-02-21T18:00:00Z",
    "deliveredBy": "uuid-parent"
  }
}
```

---

## 📅 ATTENDANCE & PROVIDERS

### POST /attendance

Create attendance record.

**Auth:** Required (Parent with child access)  
**Body:**
```json
{
  "childId": "child:111",
  "providerId": "provider:1",
  "date": "2026-02-21",
  "attended": true
}
```

**Response:** 200
```json
{
  "attendance": {
    "id": "attendance:123",
    "childId": "child:111",
    "providerId": "provider:1",
    "date": "2026-02-21",
    "attended": true,
    "createdAt": "2026-02-21T00:00:00Z"
  }
}
```

---

### GET /children/:childId/attendance

Get attendance records for child.

**Auth:** Required (must have child access)  
**Query Params:**
- `from` (optional): Start date
- `to` (optional): End date
- `providerId` (optional): Filter by provider

```http
GET /children/child:111/attendance?from=2026-02-01&to=2026-02-28
Authorization: Bearer {access_token}

Response: 200
[
  {
    "id": "attendance:123",
    "childId": "child:111",
    "providerId": "provider:1",
    "providerName": "Sunday School",
    "date": "2026-02-21",
    "attended": true
  }
]
```

---

### DELETE /attendance/:id

Delete attendance record.

**Auth:** Required (Parent with access)  
**Returns:** Success

```http
DELETE /attendance/attendance:123
Authorization: Bearer {access_token}

Response: 200
{
  "success": true
}
```

---

### POST /providers

Create attendance provider.

**Auth:** Required (Parent with family access)  
**Body:**
```json
{
  "familyId": "family:123",
  "name": "Sunday School",
  "type": "education"
}
```

**Response:** 200
```json
{
  "provider": {
    "id": "provider:1",
    "familyId": "family:123",
    "name": "Sunday School",
    "type": "education",
    "createdAt": "2026-02-21T00:00:00Z"
  }
}
```

---

### GET /providers

Get all providers for family.

**Auth:** Required (must have family access)  
**Query Params:**
- `familyId` (required): Family ID

```http
GET /providers?familyId=family:123
Authorization: Bearer {access_token}

Response: 200
[
  {
    "id": "provider:1",
    "name": "Sunday School",
    "type": "education"
  }
]
```

---

### PUT /providers/:id

Update provider.

**Auth:** Required (Parent with family access)  
**Body:**
```json
{
  "name": "Islamic Studies Class",
  "type": "education"
}
```

**Response:** 200
```json
{
  "provider": {
    "id": "provider:1",
    "name": "Islamic Studies Class",
    "updatedAt": "2026-02-21T00:00:00Z"
  }
}
```

---

### DELETE /providers/:id

Delete provider.

**Auth:** Required (Parent with family access)  
**Returns:** Success

```http
DELETE /providers/provider:1
Authorization: Bearer {access_token}

Response: 200
{
  "success": true
}
```

---

## 📝 TRACKABLE ITEMS & MILESTONES

### POST /trackable-items

Create trackable behavior item.

**Auth:** Required (Parent with family access)  
**Body:**
```json
{
  "familyId": "family:123",
  "name": "Prayer",
  "category": "worship",
  "defaultPoints": 5,
  "emoji": "🤲"
}
```

**Response:** 200
```json
{
  "trackableItem": {
    "id": "trackable:1",
    "familyId": "family:123",
    "name": "Prayer",
    "category": "worship",
    "defaultPoints": 5,
    "emoji": "🤲",
    "createdAt": "2026-02-21T00:00:00Z"
  }
}
```

---

### GET /trackable-items

Get all trackable items for family.

**Auth:** Required (must have family access)  
**Query Params:**
- `familyId` (required): Family ID

```http
GET /trackable-items?familyId=family:123
Authorization: Bearer {access_token}

Response: 200
[
  {
    "id": "trackable:1",
    "name": "Prayer",
    "category": "worship",
    "defaultPoints": 5,
    "emoji": "🤲"
  }
]
```

---

### POST /trackable-items/dedupe

Deduplicate trackable items (admin tool).

**Auth:** Required (Parent with family access)  
**Query Params:**
- `familyId` (required): Family ID

```http
POST /trackable-items/dedupe?familyId=family:123
Authorization: Bearer {access_token}

Response: 200
{
  "deduped": 3,
  "remaining": 15
}
```

---

### POST /milestones

Create milestone.

**Auth:** Required (Parent with family access)  
**Body:**
```json
{
  "familyId": "family:123",
  "name": "First 100 Points",
  "description": "Reach 100 total points",
  "pointsThreshold": 100,
  "rewardPoints": 25
}
```

**Response:** 200
```json
{
  "milestone": {
    "id": "milestone:1",
    "familyId": "family:123",
    "name": "First 100 Points",
    "pointsThreshold": 100,
    "rewardPoints": 25,
    "createdAt": "2026-02-21T00:00:00Z"
  }
}
```

---

### GET /milestones

Get all milestones for family.

**Auth:** Required (must have family access)  
**Query Params:**
- `familyId` (required): Family ID

```http
GET /milestones?familyId=family:123
Authorization: Bearer {access_token}

Response: 200
[
  {
    "id": "milestone:1",
    "name": "First 100 Points",
    "pointsThreshold": 100,
    "rewardPoints": 25
  }
]
```

---

### DELETE /milestones/:id

Delete milestone.

**Auth:** Required (Parent with family access)  
**Returns:** Success

```http
DELETE /milestones/milestone:1
Authorization: Bearer {access_token}

Response: 200
{
  "success": true
}
```

---

## 🧠 QUIZZES

### POST /quizzes

Create quiz.

**Auth:** Required (Parent with family access)  
**Body:**
```json
{
  "familyId": "family:123",
  "title": "Islamic History Quiz",
  "description": "Test your knowledge",
  "questions": [
    {
      "question": "Who was the first Caliph?",
      "options": ["Abu Bakr", "Umar", "Uthman", "Ali"],
      "correctAnswer": 0
    }
  ],
  "pointsReward": 20
}
```

**Response:** 200
```json
{
  "quiz": {
    "id": "quiz:1",
    "familyId": "family:123",
    "title": "Islamic History Quiz",
    "questionCount": 1,
    "pointsReward": 20,
    "createdAt": "2026-02-21T00:00:00Z"
  }
}
```

---

### GET /quizzes

Get all quizzes for family.

**Auth:** Required (must have family access)  
**Query Params:**
- `familyId` (required): Family ID

```http
GET /quizzes?familyId=family:123
Authorization: Bearer {access_token}

Response: 200
[
  {
    "id": "quiz:1",
    "title": "Islamic History Quiz",
    "questionCount": 5,
    "pointsReward": 20
  }
]
```

---

### GET /quizzes/:id

Get quiz by ID (with questions).

**Auth:** Required (must have family access)  
**Returns:** Full quiz with questions

```http
GET /quizzes/quiz:1
Authorization: Bearer {access_token}

Response: 200
{
  "id": "quiz:1",
  "title": "Islamic History Quiz",
  "description": "Test your knowledge",
  "questions": [
    {
      "question": "Who was the first Caliph?",
      "options": ["Abu Bakr", "Umar", "Uthman", "Ali"],
      "correctAnswer": 0
    }
  ],
  "pointsReward": 20
}
```

---

### PATCH /quizzes/:id

Update quiz.

**Auth:** Required (Parent with family access)  
**Body:**
```json
{
  "title": "Updated Quiz Title",
  "pointsReward": 25
}
```

**Response:** 200
```json
{
  "quiz": {
    "id": "quiz:1",
    "title": "Updated Quiz Title",
    "pointsReward": 25,
    "updatedAt": "2026-02-21T00:00:00Z"
  }
}
```

---

### DELETE /quizzes/:id

Delete quiz.

**Auth:** Required (Parent with family access)  
**Returns:** Success

```http
DELETE /quizzes/quiz:1
Authorization: Bearer {access_token}

Response: 200
{
  "success": true
}
```

---

### POST /quiz-attempts

Submit quiz attempt.

**Auth:** Required (Parent or Kid with family access)  
**Body:**
```json
{
  "quizId": "quiz:1",
  "childId": "child:111",
  "answers": [0, 2, 1, 3, 0],
  "completedAt": "2026-02-21T15:00:00Z"
}
```

**Response:** 200
```json
{
  "attempt": {
    "id": "attempt:123",
    "quizId": "quiz:1",
    "childId": "child:111",
    "score": 4,
    "totalQuestions": 5,
    "percentage": 80,
    "passed": true,
    "pointsEarned": 20,
    "completedAt": "2026-02-21T15:00:00Z"
  }
}
```

---

### GET /children/:childId/quiz-attempts

Get quiz attempts for child.

**Auth:** Required (must have child access)  
**Returns:** Array of quiz attempts

```http
GET /children/child:111/quiz-attempts
Authorization: Bearer {access_token}

Response: 200
[
  {
    "id": "attempt:123",
    "quizId": "quiz:1",
    "quizTitle": "Islamic History Quiz",
    "score": 4,
    "totalQuestions": 5,
    "percentage": 80,
    "pointsEarned": 20,
    "completedAt": "2026-02-21T15:00:00Z"
  }
]
```

---

### GET /quizzes/:quizId/attempts

Get attempts for specific quiz.

**Auth:** Required (must have family access)  
**Returns:** Array of attempts for quiz

```http
GET /quizzes/quiz:1/attempts
Authorization: Bearer {access_token}

Response: 200
[
  {
    "id": "attempt:123",
    "childId": "child:111",
    "childName": "Alice",
    "score": 4,
    "percentage": 80,
    "completedAt": "2026-02-21T15:00:00Z"
  }
]
```

---

## 💌 INVITES

### POST /families/:familyId/invites

Create family invite (parent only).

**Auth:** Required (Parent with family access)  
**Body:**
```json
{
  "email": "friend@example.com",
  "role": "parent",
  "expiresInDays": 7
}
```

**Response:** 200
```json
{
  "invite": {
    "id": "invite:abc123",
    "code": "ABC123XYZ",
    "familyId": "family:123",
    "email": "friend@example.com",
    "role": "parent",
    "expiresAt": "2026-02-28T00:00:00Z",
    "used": false,
    "createdAt": "2026-02-21T00:00:00Z"
  }
}
```

---

### GET /families/:familyId/invites

Get family invites (parent only).

**Auth:** Required (Parent with family access)  
**Returns:** Array of invites

```http
GET /families/family:123/invites
Authorization: Bearer {access_token}

Response: 200
[
  {
    "id": "invite:abc123",
    "code": "ABC123XYZ",
    "email": "friend@example.com",
    "role": "parent",
    "used": false,
    "expiresAt": "2026-02-28T00:00:00Z"
  }
]
```

---

### POST /invites/accept

Accept family invite (public - creates account).

**Auth:** None (Public)  
**Body:**
```json
{
  "code": "ABC123XYZ",
  "email": "friend@example.com",
  "password": "SecurePassword123!",
  "name": "Jane Doe"
}
```

**Response:** 200
```json
{
  "success": true,
  "user": {
    "id": "uuid-new",
    "email": "friend@example.com",
    "name": "Jane Doe"
  },
  "family": {
    "id": "family:123",
    "name": "The Smiths"
  }
}
```

**Errors:**
- `400` - Invite expired
- `400` - Invite already used
- `400` - Email mismatch
- `404` - Invalid invite code

---

### POST /invites/:code/revoke

Revoke family invite (parent only).

**Auth:** Required (Parent with family access)  
**Returns:** Success

```http
POST /invites/ABC123XYZ/revoke
Authorization: Bearer {access_token}

Response: 200
{
  "success": true,
  "message": "Invite revoked"
}
```

---

## 🔧 ADMIN

### POST /admin/recalculate-points/:childId

Recalculate child points from ledger (admin repair tool).

**Auth:** Required (Parent with child access)  
**Returns:** Recalculated points

```http
POST /admin/recalculate-points/child:111
Authorization: Bearer {access_token}

Response: 200
{
  "childId": "child:111",
  "oldPoints": 445,
  "newPoints": 450,
  "difference": 5,
  "ledgerEntries": 89,
  "message": "Points recalculated successfully"
}
```

**Use Cases:**
- Fix point drift from voided events
- Repair data inconsistencies
- Audit trail verification

---

### POST /test/cleanup

Delete test users and data (development only).

**Auth:** None (Public - should be disabled in production)  
**Returns:** Cleanup summary

```http
POST /test/cleanup

Response: 200
{
  "usersDeleted": 5,
  "familiesDeleted": 3,
  "childrenDeleted": 8,
  "message": "Test data cleaned up"
}
```

**⚠️  WARNING:** This endpoint should be disabled in production!

---

## ❌ ERROR HANDLING

### Error Response Format

All errors follow this structure:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {
    "field": "Additional context"
  }
}
```

### HTTP Status Codes

| Code | Meaning | Common Causes |
|------|---------|---------------|
| `200` | Success | Request successful |
| `400` | Bad Request | Invalid input, missing required fields |
| `401` | Unauthorized | Invalid or missing token |
| `403` | Forbidden | No access to resource |
| `404` | Not Found | Resource doesn't exist |
| `409` | Conflict | Duplicate or state conflict |
| `429` | Too Many Requests | Rate limited |
| `500` | Server Error | Unexpected server issue |

### Common Error Codes

```typescript
// Authentication
AUTH_MISSING_TOKEN      // No Authorization header
AUTH_INVALID_TOKEN      // Token invalid or expired
AUTH_INSUFFICIENT_PERMISSIONS // Wrong role (need parent)

// Authorization
ACCESS_DENIED           // No access to family/child
NOT_FAMILY_MEMBER       // Not in this family
NOT_CHILD_GUARDIAN      // No access to this child

// Validation
VALIDATION_ERROR        // Input validation failed
MISSING_REQUIRED_FIELD  // Required field not provided
INVALID_FORMAT          // Wrong data format

// Rate Limiting
RATE_LIMIT_EXCEEDED     // Too many requests
PIN_LOCKED              // Too many failed PIN attempts

// Business Logic
INSUFFICIENT_POINTS     // Child doesn't have enough points
DUPLICATE_ENTRY         // Resource already exists
INVALID_STATE           // Operation not allowed in current state
```

### Example Error Responses

**400 - Validation Error:**
```json
{
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": {
    "pin": "PIN must be exactly 4 digits",
    "age": "Age must be between 1 and 18"
  }
}
```

**401 - Unauthorized:**
```json
{
  "error": "Unauthorized",
  "code": "AUTH_INVALID_TOKEN"
}
```

**403 - Forbidden:**
```json
{
  "error": "Access denied",
  "code": "NOT_FAMILY_MEMBER",
  "details": {
    "familyId": "family:123",
    "reason": "User is not a member of this family"
  }
}
```

**429 - Rate Limited:**
```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Please try again later.",
  "retryAfter": 3600
}
```

---

## ⏱️ RATE LIMITING

### Rate Limits by Endpoint

| Endpoint | Limit | Window | Scope |
|----------|-------|--------|-------|
| `/auth/signup` | 5 | 1 hour | Per IP |
| `/children/:id/verify-pin` | 3 | 5 min | Per child+IP |
| `/kid/login` | Soft limit (PIN has lockout) | - | Per child |
| `/events` (POST) | 30 | 1 min | Per user |
| General API | 100 | 1 min | Per user |

### Rate Limit Headers

Responses include rate limit information:

```http
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 3
X-RateLimit-Reset: 1708524600
Retry-After: 3600
```

### Rate Limit Response

When rate limited:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 3600

{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Please try again later.",
  "retryAfter": 3600
}
```

---

## 📐 DATA MODELS

### User
```typescript
{
  id: string;              // UUID from Supabase Auth
  email: string;
  name: string;
  role: "parent" | "child";
  createdAt: string;       // ISO 8601
}
```

### Family
```typescript
{
  id: string;              // "family:{timestamp}"
  name: string;
  parentIds: string[];     // Array of user UUIDs
  inviteCode: string;      // 6-char uppercase
  createdAt: string;
  children?: Child[];      // Populated in GET requests
}
```

### Child
```typescript
{
  id: string;              // "child:{timestamp}"
  childId: string;         // Same as id
  name: string;
  familyId: string;
  pin: string;             // 4 digits (never returned in API)
  age: number;             // 1-18
  avatar: string;          // Avatar identifier
  points: number;
  createdAt: string;
}
```

### Event
```typescript
{
  id: string;              // "event:{timestamp}"
  childId: string;
  type: string;            // "prayer", "quran", etc.
  points: number;
  timestamp: string;
  createdBy: string;       // User UUID
  createdByName?: string;  // Populated in GET
  voided: boolean;
  voidedAt?: string;
  voidedBy?: string;
  voidReason?: string;
  metadata?: object;       // Additional data
  createdAt: string;
}
```

### Challenge (Quest)
```typescript
{
  id: string;              // "challenge:{timestamp}"
  childId: string;
  title: string;
  description: string;
  type: string;            // Behavior type
  targetCount: number;
  currentCount: number;
  pointsReward: number;
  difficulty: "easy" | "medium" | "hard";
  completed: boolean;
  completedAt?: string;
  expiresAt: string;
  createdAt: string;
}
```

### Reward
```typescript
{
  id: string;              // "reward:{timestamp}"
  familyId: string;
  name: string;
  description: string;
  pointsCost: number;
  category: string;
  imageUrl?: string;
  available: boolean;
  createdAt: string;
}
```

### WishlistItem
```typescript
{
  id: string;              // "wishlist:{timestamp}"
  familyId: string;
  childId: string;
  itemName: string;
  itemDescription: string;
  estimatedPoints: number;
  imageUrl?: string;
  status: "pending" | "approved" | "rejected" | "converted";
  convertedToRewardId?: string;
  createdAt: string;
}
```

### RedemptionRequest
```typescript
{
  id: string;              // "redemption:{timestamp}"
  childId: string;
  rewardId: string;
  pointsCost: number;
  quantity: number;
  totalPoints: number;     // pointsCost * quantity
  status: "pending" | "approved" | "declined" | "delivered";
  approvedAt?: string;
  approvedBy?: string;
  declinedAt?: string;
  declinedBy?: string;
  declineReason?: string;
  deliveredAt?: string;
  deliveredBy?: string;
  createdAt: string;
}
```

---

## 🔗 API VERSIONING

**Current Version:** 1.0.2

**Versioning Strategy:**
- Breaking changes will increment major version (2.0.0)
- New features increment minor version (1.1.0)
- Bug fixes increment patch version (1.0.1)

**Deprecation Policy:**
- Deprecated endpoints maintained for 6 months
- Advance notice via email to registered developers
- `X-Deprecated` header on deprecated endpoints

---

## 📞 SUPPORT

**Documentation:** This file  
**Bug Reports:** Create GitHub issue  
**Feature Requests:** Create GitHub discussion  
**Email:** support@yourcompany.com

---

## 🎉 CONGRATULATIONS!

You now have complete API documentation for the Family Growth System!

**Quick Links:**
- [Authentication](#authentication)
- [Families](#families)
- [Children](#children)
- [Quests](#quests--challenges)
- [Rewards](#rewards--wishlist)
- [Error Handling](#error-handling)

---

**Last Updated:** February 21, 2026  
**Version:** 1.0.2  
**Maintained By:** FGS Development Team
