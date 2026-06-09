# Iqra Demo Academy — Persona-driven QA Checklist

> Walk through every surface as each role using the seeded demo school
> at `iqra-demo-mq71mv17` (or whatever slug your latest seed printed).
> Mark each row ✅ pass / ⚠️ minor / ❌ blocker. Capture screenshots
> for anything that's not a clean pass.
>
> When done, the bottom of this doc has a triage template for grouping
> findings by severity for the pilot.

## Test environment

- **URL**: https://iqraifs.com (production) or `npm run dev` locally
- **School-login URL**: https://iqraifs.com/school-login
- **Principal** (you): `muneeb@azality.com` / your existing password
- **Staff shared password**: `Demo-Pakistan2026!`
- **Student PIN**: `1234`  ·  **Parent PIN**: `5678`
- **Org slug** (for PIN logins): from the seed output

---

## 1. Principal / Admin — `muneeb@azality.com`

Land on `/school/orgs/<orgId>/admin` after login.

### Dashboard tiles
- [ ] Tiles render with counts (Classes, Students, Parents, Teachers, Link codes, Roster requests, Fees, Forms, **Assessment**, **Parent inbox**, Announcements, Permissions, Settings).
- [ ] Roster requests badge shows `3` (pending requests).
- [ ] Fees badge shows the unpaid count.
- [ ] **Parent inbox badge shows `1`** (one unread thread).
- [ ] Hero card shows org name + branding.

### Classes & Sections
- [ ] `/admin/classes` lists 5 classes (Grade 1–5).
- [ ] Each class has one section (`<grade>-A`).
- [ ] Grade 3 shows Zara as class teacher; Grade 5 shows Hina; others "unassigned".
- [ ] Click into a class → roster, subjects, hifz-groups visible.

### Students
- [ ] `/admin/students` lists 30 students.
- [ ] Search + filter by class works.
- [ ] Click a student → StudentDetail loads with Academic / Hifz / Fees tabs.
- [ ] **Fees tab → "Plan & overrides"** shows class plans + 1 overridden row (sibling discount on Grade 3 student #1).
- [ ] Student → "Report card →" lands on a Term 1 report card for Grade 3 students.

### Parents
- [ ] `/admin/parents` lists 18 parents.
- [ ] Couples co-parent the same student (Imran + Saima → Hassan Ali).
- [ ] Phone numbers + PINs visible.

### Teachers
- [ ] `/admin/teachers` lists 5 staff (Adnan, Zara, Hina, Sheikh, Rabia, Kamran).
- [ ] Sheikh shows visiting-teacher validity dates.

### Link codes
- [ ] `/admin/link-codes` lists unused codes.

### Roster requests
- [ ] `/admin/roster-requests` shows 3 pending (1 add Grade 2, 1 remove Grade 1, 1 add Grade 5).
- [ ] Approve flow works → request moves to "approved".

### Fees
- [ ] `/admin/fees` shows summary tiles + per-student fee status.
- [ ] **`/admin/fees/plans`** lists 10 plans (Tuition + Books per grade).
- [ ] Add plan → Edit plan → Archive flow works.
- [ ] On a Grade 3 student → override 1 plan amount → save → re-open → override persists.

### **Timetable (NEW)**
- [ ] `/admin/timetable` loads.
- [ ] Time slots panel shows 30 slots (Mon–Fri × 6).
- [ ] Pick section "Grade 3 — 3-A" → grid populated with 4 academic slots/day.
- [ ] Try to assign a room conflict (use the same room across two sections at the same time on the same day) → server returns 409, inline warning shows colliding entry, "Save anyway" works.
- [ ] **Substitutions panel** at bottom: today shows "Hina covering Zara" (1 row).
- [ ] Add a substitution dialog: pick teacher → slot dropdown filters to teacher's slots → save → row appears.

### **Assessment (NEW)**
- [ ] `/admin/assessment` shows Term 1 (current badge).
- [ ] Term 1 expanded → Mid-term + Final exams visible.
- [ ] Click "Enter marks →" on Mid-term → pick Grade 3-A → 6 students × 6 subjects sheet populated.
- [ ] Islamiat/Quran columns show /50 max (others /100) — per-cell override works.
- [ ] Edit a mark → save → reload → persists.
- [ ] Set obtained > max → friendly error.
- [ ] **`/admin/assessment/grade-scales`** lists Iqra Academy scale.
- [ ] Bands editor: A+ at 85, save → succeeds. Try saving a gap → warning, save disabled.

### **Report cards (NEW)**
- [ ] StudentDetail → student in Grade 3 → "Report card →" → Term 1 card renders.
- [ ] Per-subject row × per-exam columns × total × letter grade (using Iqra scale).
- [ ] Comments populated: class teacher, principal, per-subject.
- [ ] Workflow strip shows Finalized + Published.
- [ ] Edit a comment → save → persists.
- [ ] Print preview hides nav chrome and prints clean.

### **Parent inbox (NEW)**
- [ ] `/admin/inbox` shows 2 threads (1 unread).
- [ ] Click unread thread → marks read, message renders chat-style.
- [ ] Reply → parent sees the reply on portal side.
- [ ] AdminDashboard badge clears after read.

### Announcements
- [ ] `/admin/announcements` list works; new draft → publish flow works.

### Forms
- [ ] `/admin/forms` lists forms (if any seeded — may be empty).
- [ ] Build form → publish → fill as parent → responses appear.

### Audit log
- [ ] `/admin/audit` shows recent invite + role-change events.

### Settings
- [ ] `/admin/settings`: branding (logo, motto, theme color), timezone, slug, address all editable + persist.
- [ ] Transfer ownership flow visible.
- [ ] Danger zone shows Delete school.

### Import center
- [ ] `/admin/import`: CSV upload flow works for a small students sample.

---

## 2. Class teacher (Zara) — `muneeb+demo-mq71mv17-zara@azality.com`

Should land on `TeacherHome` scoped to Grade 3 only.

- [ ] No "Classes" admin tile visible (teachers don't see admin nav).
- [ ] "My classes" grid shows only Grade 3 — 3-A.
- [ ] **"Today's schedule" card visible** (NEW) — lists Zara's slots for today, room labels.
- [ ] **"See full week →"** link → `/my-week` page renders 7-day grid.
- [ ] If today is the substitution day: today's card shows "Covered by Hina" muted pill on covered slot.
- [ ] Section → attendance roll-call works for Grade 3.
- [ ] Section → behavior feed → add a positive note → appears.
- [ ] Section → lessons feed → 3 lessons visible per subject.
- [ ] Section → hifz overview → entry log works.
- [ ] Section → gradebook → 2 assignments, 1 graded.
- [ ] Section → assignments → add new assignment works.
- [ ] **Marks entry** sheet works (gradebook of exam marks, not assignment grades).

---

## 3. Class teacher (Hina) — `muneeb+demo-mq71mv17-hina@azality.com`

- [ ] Lands on TeacherHome scoped to Grade 5 only.
- [ ] "Today's schedule" card shows Hina's slots, **including the covering slot for Zara today** with "Covering for Zara" amber pill (NEW).
- [ ] Grade 3 sections NOT visible to Hina.

---

## 4. Visiting teacher (Sheikh) — `muneeb+demo-mq71mv17-sheikh@azality.com`

- [ ] Lands on TeacherHome scoped to Quran across all 5 grades.
- [ ] "Today's schedule" card shows Quran slots across multiple sections.
- [ ] Validity-window banner if approaching expiry.
- [ ] Can enter hifz progress but NOT general behavior in non-assigned subjects.

---

## 5. Office staff (Rabia) — `muneeb+demo-mq71mv17-rabia@azality.com`

- [ ] Lands on OfficeStaffHome (NOT principal dashboard).
- [ ] Can see Students + Classes + Attendance + Parent inbox.
- [ ] **Cannot** see Fees / Assessment / Grade scales / Settings.
- [ ] Parent inbox shows the 2 threads; reply works.

---

## 6. Financial staff (Kamran) — `muneeb+demo-mq71mv17-kamran@azality.com`

- [ ] Lands on FinanceHome.
- [ ] Sees Fees (collection summary, per-student status).
- [ ] **Can edit fee plans + per-student overrides** (granted to financial_staff).
- [ ] **Cannot** see Assessment / Timetable / Settings.
- [ ] Receipt PDF download works on a paid fee row.

---

## 7. Parent (Imran Ali) — phone `+92 300 1001001` / PIN `5678`

Log in at `/school-login` with slug + phone + PIN.

### Multi-child landing
- [ ] **PortalHome shows the multi-child card** (NEW) — Imran has only 1 child (Hassan Ali Grade 1), so 1 card.
- [ ] **Status pills render** (NEW): attendance today, fees due (if any), hifz revision flag, teacher note, etc.
- [ ] Tap a pill → drills to the right detail page.

### Per-child surfaces
- [ ] **Status cards expanded** (NEW) on `/students/<id>` — same content as pills, larger.
- [ ] **Today's Diary card** (NEW from #165) — today's lessons + assignments + hifz line.
- [ ] Recent activity table — last events.

### Navigation tabs (parent has all these)
- [ ] **Timetable** (NEW) — weekly grid, today highlighted; sub badge if there's a substitution today.
- [ ] Lessons — feed by subject.
- [ ] Grades — gradebook view (assignment grades).
- [ ] **Report card** (NEW) — Grade 1 student has no published card; should show empty state. (Switch to a Grade 3 child if you log in as a Grade-3 parent.)
- [ ] Hifz — progress entries.
- [ ] Attendance — calendar view.
- [ ] Behavior — teacher notes.
- [ ] Fees — invoices, paid history, **Plan & overrides surface NEW**.
- [ ] **Contact school** (NEW) — sees the 2 threads Imran started; can reply; new compose works.
- [ ] **Comments** (NEW) — chronological feed of all teacher remarks (behavior + hifz + lesson + report-card + exam notes).
- [ ] Announcements — global + targeted announcements.
- [ ] Forms — pending forms badge.

### Cross-cutting checks
- [ ] Language toggle (English / Urdu) works.
- [ ] Logo + motto in header match the seed branding.
- [ ] Logout works.

---

## 8. Parent of a Grade 3 student — Hamid Farooq `+92 300 1001007`

Hamid → Ayesha Tariq (Grade 1). Pick a Grade 3 parent instead to see report cards. Per the seed: Aisha Mehmood IDA-016 — find their parents.

### Specifically test
- [ ] **Report card published** → Term 1 card renders with comments + per-subject teacher remarks + class teacher + principal comments.
- [ ] Print from portal works (browser print → save as PDF).
- [ ] **Comments feed** shows the report-card comments alongside lesson + hifz remarks.

---

## 9. Student (Hassan Ali) — GR `IDA-001` / PIN `1234`

- [ ] Lands on their own dashboard directly (no multi-child picker — students see only themselves).
- [ ] Same tabs as parent except **no Contact school** (parent-only).
- [ ] Cannot drill into siblings (Hassan has none).

---

## 10. Edge cases worth a quick pass

- [ ] **Cross-tenant isolation**: log in as a teacher from one demo org, try to URL-jump into another org's section. Should 403.
- [ ] **Empty states**: open a grade with no exam scores yet (Grade 1) → marks sheet shows "no students" or empty grid (NOT a crash).
- [ ] **Past due fee + hifz revision + concern note simultaneously** → all three pills render on one parent card.
- [ ] **Print** report cards on actual A4 paper (or save-as-PDF) → clean header, no nav chrome leaking.
- [ ] **Mobile** (DevTools narrow viewport): portal home, timetable, contact school, report card all readable.

---

## Triage template

When walking through, paste any findings here:

### 🔴 Pilot blockers (must fix before Aug 2026 launch)
- [ ] _none yet_

### 🟡 Minor (fix in the first sprint post-launch)
- [ ] _none yet_

### 🟢 Cosmetic / nice-to-have
- [ ] _none yet_

### ❓ Questions for the principal / parents
- [ ] _none yet_

---

## After the walkthrough

If 0 blockers → ready for pilot signoff.
If 1–3 blockers → spin up a `fix/qa-blockers` PR sequence.
If 4+ blockers → schedule a dedicated bug-bash week before invitations go out.
