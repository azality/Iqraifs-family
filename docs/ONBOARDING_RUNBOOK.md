# School Onboarding Runbook — Iqra Islamic Foundation School

The click-by-click path from "no account" to "teachers taking attendance."
Written for the Iqra IFS pilot; reusable for any new school.

Everything below is self-service in the app — no SQL, no developer needed,
except the two items marked **[Muneeb]**.

---

## Phase 0 — Before meeting the school (Muneeb, ~15 min)

1. **Create the org.** Go to `iqraifs.com/signup`, choose the **school**
   path, and create the organization.
   - **Slug matters**: it becomes the permanent front door —
     `iqraifs.com/<slug>` (public site) and `iqraifs.com/<slug>/login`
     (everyone's sign-in). Suggested: `iqra-ifs`. It will be printed on
     PIN slips — don't plan to change it.
   - Whoever creates the org becomes principal. If you create it, use
     **Admin home → transfer ownership** later to hand it to the real
     principal.
2. **Verify the two URLs** load: the public site and the unified login.
3. **[Muneeb] If they add campuses later**: creating a `school_group` is
   still a SQL step. Head-office *staff* management has a UI (chain
   dashboard → Head-office staff), but the group row itself doesn't.
   Not needed for a single-school pilot.

## Phase 1 — First sitting with the principal (~1 hour)

Sign in at `iqraifs.com/iqra-ifs/login` (Staff tab). The dashboard shows
the **setup checklist** — this phase is that checklist, in order.

1. **School settings** (Admin → Settings):
   - Timezone (drives "today" for attendance and diaries)
   - Logo, motto, theme color (shown on the parent portal + public site)
   - School schedule: working days, period length, holidays (Eid, Dec 25,
     Ramadan timings)
2. **Academic year & terms** (Academics → Assessment): create Term 1
   (Aug–Dec). Marks entry and report cards need a term to exist.
3. **Classes & sections** (Academics → Classes): create Grade 1..7 (+
   Hifz section), add a section per class (e.g. "A"). Leave teacher
   dropdowns empty until step 4.
4. **Teachers** (People → Teachers): add each teacher by **email + name +
   role** (class teacher / visiting / hifz / office / finance).
   - New emails get an account automatically; the teacher sets their
     password with **"Forgot password"** on the login page. Tell them this
     — it's the whole staff onboarding.
   - Back on Classes, assign class teachers and hifz teachers per section
     (two separate dropdowns).
5. **Students** (Admin home → Import): upload the roster from Excel/CSV
   via **Import Center** (columns: GR#, name, class-section, guardian
   phone …). Import is reversible (rollback button) if the mapping goes
   wrong. For a handful of students, People → Students → Add works too.
6. **Behavior categories** (Admin → Behavior categories): a starter set
   (Adab, Akhlaq, Salah punctuality…) is already seeded — rename/reorder
   to the school's own language. 5 minutes.
7. **Permissions** (Admin → Permissions, principal only): the defaults are
   sensible — office staff can manage students/attendance, finance can
   mark fees, visiting teachers can't edit grades. Only touch if the
   school wants different rules.
8. **Timetable** (Academics → Timetable): define the week template once
   (periods per day), then fill each section's grid. The substitute pool
   lives here too. This can wait for week 2 — attendance doesn't need it.
9. **First announcement** (Communications → Announcements): "Welcome to
   the new school system" — proves the parent-facing pipe works.

## Phase 2 — Parent & student access (office staff, ongoing)

1. **PINs**: each student and parent signs in with a PIN at the same
   `iqraifs.com/iqra-ifs/login` (Student tab: GR# + PIN; Parent tab:
   phone + PIN).
   - Set PINs from the student page (**Set PIN**) or generate **link
     codes** in bulk (People → Link codes).
   - Distribution format that worked in the demo: one slip per family —
     school code (`iqra-ifs`), parent phone + PIN, each child's GR# + PIN.
2. **Urdu**: the parent/student portal is fully translated — the EN/اردو
   toggle is top-right on the login and portal. Staff screens are
   English (pilot decision).
3. **Duplicate parents**: after import, check People → Parents — the
   "Possible duplicate parents" panel flags same-phone/same-name rows
   with one-click merge.

## Phase 3 — Daily operation (teachers, week 1)

- **Teachers** land on their own home: today's periods, roll-call nudge,
  their sections. Daily loop = **Take attendance** (one tap per child) +
  **Hifz log** (surah + ayah range) + optional behavior notes.
- **Hifz teachers** see "My hifz groups" with tap-through to each
  student's log.
- **Office staff** land on roster requests / missing contacts; **finance**
  on the collection dashboard.
- **Parents** see the day same-day: attendance pill, diary, hifz,
  announcements. (Verified end-to-end in the July demo: a mark at 1:32pm
  showed on the parent card within the minute.)

## Pilot discipline (from the May sign-off)

- Shadow mode: paper + app in parallel for the first 4 weeks, one Hifz
  section + one mainstream class.
- Weekly check-in with the principal; the Audit log (Admin → Audit log)
  answers "who changed what" questions.

## When something goes wrong

- **"You don't have access" toast** → the role/permission is missing; the
  principal grants it under Admin → Permissions (or the person is signed
  in with the wrong account).
- **Wrong campus / student moved** → student page → **Transfer** (chains)
  or edit the class-section (same school).
- **A teacher left** → People → Teachers → remove role. Their account
  stays (family-app access unaffected).
- **Deploy note [Muneeb]**: after merging any PR touching
  `supabase/functions/`, run
  `npx supabase functions deploy make-server-f116e23f`.
