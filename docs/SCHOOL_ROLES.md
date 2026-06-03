# School roles — capabilities, login flow, test checklist

**Status:** Aspirational for Iqra Academy pilot (Aug 2026). Gaps audited against
code at the bottom of this doc. Every gap is a TODO before pilot.

**Trust root:** `principal` is the single owner per org. Only the principal can
delete the school or cancel the subscription. Everything else is delegated.

---

## 1. Role overview

| Role               | Scope                  | Created by          | Headcount per school |
|--------------------|------------------------|---------------------|----------------------|
| Principal          | Whole school           | Signs themselves up | 1                    |
| Admin              | Whole school           | Principal           | 1–4                  |
| Class Teacher      | Their assigned classes | Principal or Admin  | 10–40                |
| Visiting Teacher   | Specific classes/days  | Principal or Admin  | 0–10                 |
| Financial Staff    | Fees only              | Principal or Admin  | 1–2                  |
| Office Staff       | Admin-lite, no money   | Principal or Admin  | 1–3                  |
| Student            | Their own record       | Principal or Admin  | 50–500               |
| Parent             | Their children only    | Principal or Admin (invite by code) | 50–500 |

---

## 2. Capability matrix

Legend: ✅ allowed · ❌ blocked · 🟡 own scope only · ⏳ not yet wired (see Gaps)

| Capability                                  | Principal | Admin | Class T. | Visiting T. | Financial | Office | Student | Parent |
|---------------------------------------------|:---------:|:-----:|:--------:|:-----------:|:---------:|:------:|:-------:|:------:|
| **School lifecycle**                        |           |       |          |             |           |        |         |        |
| Sign up the school                          | ✅        | ❌    | ❌       | ❌          | ❌        | ❌     | ❌      | ❌     |
| Delete the school / cancel subscription     | ✅        | ❌    | ❌       | ❌          | ❌        | ❌     | ❌      | ❌     |
| Edit school name / settings                 | ✅        | ✅    | ❌       | ❌          | ❌        | ❌     | ❌      | ❌     |
| **Staff management**                        |           |       |          |             |           |        |         |        |
| Add / remove admins                         | ✅        | ❌    | ❌       | ❌          | ❌        | ❌     | ❌      | ❌     |
| Add / remove teachers & staff               | ✅        | ✅    | ❌       | ❌          | ❌        | ❌     | ❌      | ❌     |
| Edit role permissions overrides             | ✅        | ⏳    | ❌       | ❌          | ❌        | ❌     | ❌      | ❌     |
| **Classes & roster**                        |           |       |          |             |           |        |         |        |
| Create / delete classes                     | ✅        | ✅    | ❌       | ❌          | ❌        | ✅     | ❌      | ❌     |
| Assign teachers to classes                  | ✅        | ✅    | ❌       | ❌          | ❌        | ✅     | ❌      | ❌     |
| Add / remove students from class            | ✅        | ✅    | 🟡       | ❌          | ❌        | ✅     | ❌      | ❌     |
| View class roster                           | ✅        | ✅    | 🟡       | 🟡          | ❌        | ✅     | ❌      | 🟡 (own child) |
| **Daily ops**                               |           |       |          |             |           |        |         |        |
| Take attendance                             | ✅        | ✅    | 🟡       | 🟡          | ❌        | ⏳     | ❌      | ❌     |
| Log behavior / points events                | ✅        | ✅    | 🟡       | 🟡          | ❌        | ❌     | ❌      | ❌     |
| Void / adjust points                        | ✅        | ✅    | 🟡       | ❌          | ❌        | ❌     | ❌      | ❌     |
| **Academics**                               |           |       |          |             |           |        |         |        |
| Enter quiz / assessment scores              | ✅        | ✅    | 🟡       | 🟡          | ❌        | ❌     | ❌      | ❌     |
| Hifz tracking — log new sabaq/sabqi/manzil  | ✅        | ✅    | 🟡       | 🟡          | ❌        | ❌     | ❌      | ❌     |
| View student academic record                | ✅        | ✅    | 🟡       | 🟡          | ❌        | ✅     | 🟡 (own)| 🟡 (own child) |
| **Fees**                                    |           |       |          |             |           |        |         |        |
| Define fee structures                       | ✅        | ✅    | ❌       | ❌          | ✅        | ❌     | ❌      | ❌     |
| Record payment / issue receipt              | ✅        | ✅    | ❌       | ❌          | ✅        | ⏳     | ❌      | ❌     |
| View fee ledger (school-wide)               | ✅        | ✅    | ❌       | ❌          | ✅        | ❌     | ❌      | ❌     |
| View own/child fee history                  | —         | —     | —        | —           | —         | —      | 🟡      | 🟡     |
| **Forms / announcements**                   |           |       |          |             |           |        |         |        |
| Publish announcement                        | ✅        | ✅    | 🟡 (class)| ❌         | ❌        | ✅     | ❌      | ❌     |
| Send roster-request to parents              | ✅        | ✅    | ❌       | ❌          | ❌        | ✅     | ❌      | ❌     |
| **Parent portal**                           |           |       |          |             |           |        |         |        |
| Link to child via invite code               | —         | —     | —        | —           | —         | —      | —       | ✅     |
| View child progress / hifz / points         | —         | —     | —        | —           | —         | —      | —       | 🟡     |
| Respond to roster requests / forms          | —         | —     | —        | —           | —         | —      | —       | 🟡     |
| **Student portal**                          |           |       |          |             |           |        |         |        |
| View own dashboard / points / hifz progress | —         | —     | —        | —           | —         | —      | 🟡      | —      |
| Self-log items (e.g. reading)               | —         | —     | —        | —           | —         | —      | ⏳      | —      |
| **Account self-service** (all roles)        |           |       |          |             |           |        |         |        |
| Change own password                         | ✅        | ✅    | ✅       | ✅          | ✅        | ✅     | ⏳      | ✅     |
| Edit own profile (name, photo)              | ✅        | ✅    | ✅       | ✅          | ✅        | ✅     | ⏳      | ✅     |
| Delete own account                          | See above | ✅ (revokes role only) | ✅ | ✅ | ✅     | ✅     | ❌ (principal removes) | ✅ |

---

## 3. Login & invite flow

### 3.1 Principal — self-signup

1. Goes to `iqraifs.com`, picks "I'm starting a school" intent on signup.
2. Supabase Auth creates the user. JWT carries `app_metadata.signupIntent: "school"`.
3. First-time login → onboarding wizard creates the `organizations` row and inserts
   `user_roles(role_type="principal", scope_type="organization", scope_id=<new orgId>)`.
4. Their workspace switcher now shows the school. They can also still have a
   family workspace from the original consumer app.

### 3.2 Admin / Teacher / Staff — invited

Single flow for all five invited roles. Triggered by principal/admin clicking
"Add Admin" or "Add Teacher" (with role template).

```
[Principal clicks Add]
        │
        ▼
POST /school/orgs/:orgId/{admins|teachers}
        │
        ├── email already a Supabase Auth user?
        │       ├─ YES → insert user_roles row · invited=false
        │       │         (they keep their existing password)
        │       └─ NO  → createUser(email_confirm=true) + insert user_roles
        │                 → resetPasswordForEmail()
        │                 → Supabase sends password-reset email
        │                 → user clicks link → /reset-password → sets password
        ▼
Invited user signs in at iqraifs.com → workspace switcher shows the school
```

**Notes & gotchas**
- The reset email is **non-essential** — the role row is what grants access. If
  the email fails (PR #72 catches `AuthApiError` for addresses Supabase rejects),
  the principal can manually share the reset link from Supabase Auth dashboard
  or re-invite later.
- The JWT's `role` field stays `"parent"` (or whatever Supabase set at signup) —
  it does NOT change to `"admin"`. Org-scoped permissions come from `user_roles`
  on every request. This is intentional: one human can be parent in family-app
  AND admin in school workspace simultaneously.
- Dedupe rule (PR #69): adding someone who already has *any* non-revoked role in
  the org returns 409 with a message like "This user is already a principal of
  this school."

### 3.3 Parent — joins via link code

1. Principal/admin generates a link code per student (from Manage → Link Codes).
2. Parent receives code (paper handout, SMS, in-person).
3. Parent signs up at `iqraifs.com` → enters code → backend creates
   `parent_child_link` row connecting parent's `user_id` to the student.
4. School workspace appears in their switcher (scoped to that child only).

### 3.4 Student — credentials issued by school

Two modes (decide before pilot):
- **(A) PIN-only kid session** (current family-app pattern): student signs in
  with a numeric PIN on a shared device. No email.
- **(B) Full account**: principal creates email + password for older students.
  Same invite flow as teachers.

**Iqra pilot:** grades 1–4 → mode A, grades 5–7 + Hifz → mode B. ⏳ Not yet
decided in code.

---

## 4. Test checklist (run before every release)

For each role, walk through this list with a fresh test account. Mark ✅/❌ in
the release ticket.

### Principal
- [ ] Sign up with school intent → land in onboarding wizard
- [ ] Create org → workspace switcher shows it
- [ ] Add admin (new email) → email arrives, admin can set password and log in
- [ ] Add admin (existing user) → no email, dedupe blocks if already has role
- [ ] Remove admin → revokes role, admin loses school workspace next login
- [ ] Add each teacher template (class / visiting / financial / office) → succeeds
- [ ] Create class, assign teacher, add students
- [ ] Cannot be added as admin to own school (dedupe should block)
- [ ] Edit org settings
- [ ] (Pre-pilot) Delete school flow — confirms with typed school name

### Admin
- [ ] Receives invite email, sets password, logs in
- [ ] School workspace visible in switcher
- [ ] CAN add teachers, classes, students
- [ ] CANNOT add/remove other admins (button hidden or 403)
- [ ] CANNOT delete the school
- [ ] CANNOT edit role permission templates (or 🟡 — TBD)

### Class Teacher
- [ ] Logs in, sees only their assigned classes
- [ ] Takes attendance for own class — succeeds
- [ ] Takes attendance for another class — blocked
- [ ] Logs points event for own student — succeeds
- [ ] Voids own previous event — succeeds; another teacher's — blocked
- [ ] Records Hifz progress

### Visiting Teacher
- [ ] Same as class teacher but ONLY for classes they're scheduled to
- [ ] Cannot void points (test the restriction)
- [ ] Cannot add/remove students from class

### Financial Staff
- [ ] Sees Fees module, sees ALL students
- [ ] Cannot see attendance / academics / hifz UI (hidden)
- [ ] Records a payment → receipt generated
- [ ] Defines fee structure

### Office Staff
- [ ] Sees Classes, Students, Announcements
- [ ] Does NOT see Fees details (or sees only enrolled/not-enrolled flag)
- [ ] Cannot take attendance (or can — TBD, see gaps)
- [ ] Can publish school-wide announcement

### Student (mode A — PIN)
- [ ] Signs in with PIN on shared device
- [ ] Sees own dashboard, points, hifz progress
- [ ] Cannot see other students

### Student (mode B — full account)
- [ ] Receives invite email, sets password
- [ ] Same as mode A from there

### Parent
- [ ] Signs up + enters link code → child appears
- [ ] Sees own child's progress, NOT siblings unless multiple codes entered
- [ ] Receives roster-request notification, responds
- [ ] Sees fee ledger for own child only

---

## 5. Gaps audited against current code (TODOs before pilot)

These are the **⏳ rows above** and other shortfalls found in code as of
2026-06-03. Address each before Aug 2026.

### Authorization gaps
1. **No middleware-level role guard.** Each route hand-checks `isPrincipalOf`,
   `isOrgAdmin`, etc. Easy to forget on a new route. → Add a single
   `requireRole(orgId, [...allowed])` helper and use it everywhere.
2. **Class-teacher scope not enforced server-side for most endpoints.** A class
   teacher could currently call attendance/points endpoints for any class in
   their org if they know the IDs. UI hides it; backend doesn't enforce. → Add
   "is teacher of class X" check in `schoolPhaseB.tsx` handlers.
3. **`role_template_override` table exists but PermissionsEditor isn't wired to
   all gates.** Permissions are still mostly hardcoded by role. → Audit each
   capability above and make sure it actually reads from the override table.

### Missing capabilities
4. **Delete school flow:** no endpoint, no UI. Add `DELETE /school/orgs/:orgId`
   gated by principal + typed-name confirmation + soft-delete + grace period.
5. **Edit org settings:** partial — name editable, but not branding/timezone/
   academic-year config.
6. **Office staff attendance:** not decided. Iqra wants office to take
   attendance when class teacher is absent. Currently blocked.
7. **Financial staff fee receipt PDF:** receipt generation stub only.
8. **Student self-service:** no UI for changing PIN / password yet.
9. **Account deletion (non-principal):** no UI; only revokes role, doesn't
   delete Supabase Auth user.

### Login / invite gaps
10. **No resend-invite button.** If the original email fails (bad address, spam
    folder), principal has no UI to re-trigger. Has to delete + re-add. → Add
    `POST /teachers/:userId/resend-invite`.
11. **No invite expiry / audit log.** Can't see who invited whom or when.
12. **Email validator failures are silent.** PR #72 catches them server-side but
    the principal sees "Teacher added" with no warning that the email never
    sent. → Surface `invitedCount: 0` as a yellow notice: "Teacher added but
    invite email could not be sent — share the password reset link manually."

### Testing gaps
13. **No automated tests for any of the above.** Everything is manual.
14. **No seed script** to spin up a test org with each role populated, so
    walking the checklist requires ~30 min of manual setup. → Build
    `scripts/seed-test-school.ts`.

---

## 6. Product decisions (locked 2026-06-03)

- **Q1 — Admin removal:** Only the principal can add or remove admins.
  Admins cannot remove other admins. (No code change — already enforced.)

- **Q2 — Teacher removal & data access:** Revoking a teacher's role
  immediately cuts off their access to past student records too — not just
  new permissions. **Already enforced** by the gate pattern: every read
  filters `user_roles.revoked_at IS NULL`, so the moment the role is
  revoked, all queries from that user start failing the membership check.
  The teacher's *name* still appears on historical attendance / behavior /
  hifz rows they recorded — that's correct for audit (we don't rewrite
  history).

- **Q3 — Parent multi-child linking:** Parent should see all their children
  via a child-switcher in the portal. Auto-link by email IS allowed
  **only during parent self-signup with a link code** — i.e. when the
  parent enters a code AND their authenticated email matches the email on
  an existing parent record in the same org, the second student is added
  to that existing parent record (no new account).
  **Safeguard:** when an admin/principal manually adds a parent by typing
  an email, no automatic claim happens. The link-code flow is the only
  path that grants access to a child's data. This prevents staff from
  mistakenly granting one parent access to another family's records.

- **Q4 — Office staff vs financial staff:** Two distinct roles, both kept:
  - `financial_staff` → fees only (billing person).
  - `office_staff` → front-desk receptionist. Can manage students,
    attendance, forms, announcements. **NO fees**, **NO grades**.
    In the UI this role is now labeled **"Office / Reception"** to make
    the distinction clear from financial_staff.
  - One person can hold both roles if the school is small.
  - Non-login roles (bus driver, security guard, lunch staff) do NOT need
    a system account — they aren't represented in `user_roles` at all.

- **Q5 — Visiting teacher validity window:** Replaced "can they void?" with
  a stricter model. When adding a visiting teacher, principal/admin
  specifies `valid_from` and `valid_until` dates. The role row is only
  effective inside that window — outside it, every scope check fails as
  if the role didn't exist. Reading the dates also gives the principal
  a clear "what's the contract" answer. Void/edit rules now fall out of
  the validity window (a visiting teacher can void their own events
  while their role is still valid; once `valid_until` passes, all
  permissions are gone).
