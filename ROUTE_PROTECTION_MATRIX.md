# Route Protection Matrix - Day 3 Implementation Guide

**Date**: February 18, 2026  
**Task**: Apply middleware to all 26 routes

---

## 🎯 Protection Patterns

### **Pattern 1: Public (No Auth)**
- Health checks, signup, invite acceptance
- Rate limiting only

### **Pattern 2: Kid-Accessible (Auth + Family Access)**
- Read own profile, events, challenges
- `requireAuth` + `requireFamilyAccess`

### **Pattern 3: Parent-Only (Auth + Parent + Family Access)**
- Write operations, void, admin
- `requireAuth` + `requireParent` + `requireFamilyAccess`

### **Pattern 4: Parent-Only (Auth + Parent, No Family Check)**
- Create family, system-wide operations
- `requireAuth` + `requireParent`

---

## 📋 Route Inventory (26 Endpoints)

### **Authentication (2 routes)**

| Endpoint | Method | Pattern | Middleware |
|----------|--------|---------|------------|
| `/auth/signup` | POST | Public | `rateLimit('signup', 10, 60)`, `validate(validateSignup)` |
| `/health` | GET | Public | None |

---

### **Families (4 routes)**

| Endpoint | Method | Pattern | Middleware |
|----------|--------|---------|------------|
| `POST /families` | POST | Parent-only | `requireAuth`, `requireParent`, `validate(validateFamily)` |
| `GET /families/:id` | GET | Family access | `requireAuth`, `requireFamilyAccess` |
| `POST /families/:familyId/invites` | POST | Parent-only | `requireAuth`, `requireParent`, `requireFamilyAccess`, `validate(validateInvite)` |
| `GET /families/:familyId/invites` | GET | Parent-only | `requireAuth`, `requireParent`, `requireFamilyAccess` |

---

### **Invites (2 routes)**

| Endpoint | Method | Pattern | Middleware |
|----------|--------|---------|------------|
| `POST /invites/accept` | POST | Public | `validate(validateInviteAccept)` |
| `POST /invites/:code/revoke` | POST | Parent-only | `requireAuth`, `requireParent` |

---

### **Children (6 routes)**

| Endpoint | Method | Pattern | Middleware |
|----------|--------|---------|------------|
| `POST /children` | POST | Parent-only | `requireAuth`, `requireParent`, `validate(validateChild)` |
| `GET /families/:familyId/children` | GET | Family access | `requireAuth`, `requireFamilyAccess` |
| `GET /children/:id` | GET | Family access | `requireAuth`, `requireFamilyAccess` |
| `PATCH /children/:id` | PATCH | Parent-only | `requireAuth`, `requireParent`, `requireFamilyAccess` |
| `POST /children/:id/verify-pin` | POST | Public | `rateLimit('pin', 5, 300)`, `validate(validatePinVerify)` |
| `GET /children/:childId/events` | GET | Family access | `requireAuth`, `requireFamilyAccess` |

---

### **Events (2 routes)**

| Endpoint | Method | Pattern | Middleware |
|----------|--------|---------|------------|
| `POST /events` | POST | Parent-only | `requireAuth`, `requireParent`, `rateLimit('events', 30, 60)`, `validate(validatePointEvent)` |
| `POST /events/:id/void` | POST | Parent-only | `requireAuth`, `requireParent`, `validate(validateVoid)` |

---

### **Providers (4 routes)**

| Endpoint | Method | Pattern | Middleware |
|----------|--------|---------|------------|
| `POST /providers` | POST | Parent-only | `requireAuth`, `requireParent`, `validate(validateProvider)` |
| `GET /providers` | GET | Family access | `requireAuth`, `requireFamilyAccess` |
| `PUT /providers/:id` | PUT | Parent-only | `requireAuth`, `requireParent`, `validate(validateProvider)` |
| `DELETE /providers/:id` | DELETE | Parent-only | `requireAuth`, `requireParent` |

---

### **Attendance (2 routes)**

| Endpoint | Method | Pattern | Middleware |
|----------|--------|---------|------------|
| `POST /attendance` | POST | Parent-only | `requireAuth`, `requireParent`, `validate(validateAttendance)` |
| `GET /children/:childId/attendance` | GET | Family access | `requireAuth`, `requireFamilyAccess` |

---

### **Trackable Items (2 routes)**

| Endpoint | Method | Pattern | Middleware |
|----------|--------|---------|------------|
| `POST /trackable-items` | POST | Parent-only | `requireAuth`, `requireParent`, `validate(validateTrackableItem)` |
| `GET /trackable-items` | GET | Family access | `requireAuth`, `requireFamilyAccess` |

---

### **Milestones & Rewards (4 routes)**

| Endpoint | Method | Pattern | Middleware |
|----------|--------|---------|------------|
| `POST /milestones` | POST | Parent-only | `requireAuth`, `requireParent`, `validate(validateMilestone)` |
| `GET /milestones` | GET | Family access | `requireAuth`, `requireFamilyAccess` |
| `POST /rewards` | POST | Parent-only | `requireAuth`, `requireParent`, `validate(validateReward)` |
| `GET /rewards` | GET | Family access | `requireAuth`, `requireFamilyAccess` |

---

### **Challenges (3 routes)**

| Endpoint | Method | Pattern | Middleware |
|----------|--------|---------|------------|
| `POST /children/:childId/challenges/generate` | POST | Parent-only | `requireAuth`, `requireParent`, `requireFamilyAccess` |
| `GET /children/:childId/challenges` | GET | Family access | `requireAuth`, `requireFamilyAccess` |
| `POST /children/:childId/challenges/evaluate` | POST | System | `requireAuth` (both parents and kids can trigger) |
| `GET /children/:childId/challenge-analytics` | GET | Parent-only | `requireAuth`, `requireParent`, `requireFamilyAccess` |

---

### **Quizzes (6 routes)**

| Endpoint | Method | Pattern | Middleware |
|----------|--------|---------|------------|
| `POST /quizzes` | POST | Parent-only | `requireAuth`, `requireParent`, `validate(validateQuiz)` |
| `GET /quizzes` | GET | Family access | `requireAuth`, `requireFamilyAccess` |
| `GET /quizzes/:id` | GET | Family access | `requireAuth`, `requireFamilyAccess` |
| `PATCH /quizzes/:id` | PATCH | Parent-only | `requireAuth`, `requireParent`, `validate(validateQuiz)` |
| `DELETE /quizzes/:id` | DELETE | Parent-only | `requireAuth`, `requireParent` |
| `POST /quiz-attempts` | POST | Kid-accessible | `requireAuth`, `validate(validateQuizAttempt)` |
| `GET /children/:childId/quiz-attempts` | GET | Family access | `requireAuth`, `requireFamilyAccess` |
| `GET /quizzes/:quizId/attempts` | GET | Parent-only | `requireAuth`, `requireParent` |

---

### **Admin (2 routes)**

| Endpoint | Method | Pattern | Middleware |
|----------|--------|---------|------------|
| `POST /admin/recalculate-points/:childId` | POST | Parent-only | `requireAuth`, `requireParent`, `requireFamilyAccess` |
| `GET /admin/system-stats` | GET | Parent-only | `requireAuth`, `requireParent` |

---

## 📊 Summary Stats

- **Total routes**: 39 (updated count)
- **Public (no auth)**: 3
- **Kid-accessible**: 15
- **Parent-only**: 21

---

## ✅ Implementation Checklist

- [ ] Add missing validators (Provider, Attendance, Milestone, Reward, Quiz, QuizAttempt)
- [ ] Apply middleware to all 39 routes
- [ ] Test parent-only routes reject kid tokens (403)
- [ ] Test kid routes accept kid tokens (200)
- [ ] Test public routes work without auth (200)
- [ ] Test rate limiting on PIN verify (429 after 5 attempts)
- [ ] Test validation errors return 400 with details

---

**Next**: Implement missing validators, then apply middleware systematically
