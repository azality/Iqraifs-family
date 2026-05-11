# School Pilot — Spec for Principal Review

**Audience:** Principal + Head of Hifz + 1 Class Teacher
**Goal:** lock the shape of what the app tracks, who logs what, what parents see. Not screen designs — decisions.
**Pilot scope:** ONE campus, Hifz section + ONE mainstream class (e.g. Grade 3-A). Other campuses + classes added after pilot proves out.

---

## 1. What the app tracks (one line each)

- **Salah** — 5 daily prayers, per student
- **Hifz progress** — sabaq, sabaq-para, manzil (Hifz students only)
- **Behavior** — positive recognitions + concerns (every student)
- **Attendance** — class-day, with reason field for absent/late
- **Mainstream subjects** — daily diary, homework, assignments, test scores
- **Recognition rewards** — badges, certificates, leaderboards, privileges (school side, NO consumer rewards)
- **Family side (existing, unchanged)** — parents can keep their own wishlist/Lego reward economy at home in parallel

## 2. Roles

| Role | Can do |
|------|--------|
| **Principal** | See everything in the school, invite teachers, set school-wide policy (Salah point values, behavior categories, reward tiers) |
| **Teacher (class teacher)** | See their class roster; log behavior, attendance, Salah, daily diary, homework, assignments, test scores for own students |
| **Teacher (Hifz qari)** | See Hifz students they teach; log sabaq, sabaq-para, manzil, behavior, Salah, attendance |
| **Parent** | See their own child's full record across school + home. Log home-side behaviors/habits as today. Cannot log school-side data. |
| **Student (kid app)** | See own progress; submit prayer claims; same as today |

A teacher who is also a parent at the school uses one login that holds both roles.

## 3. Common to every student

### Salah
- 5 prayers tracked per day. School day prayers (Zuhr, Asr) typically logged by teacher; Fajr/Maghrib/Isha by parent. Either can log either.
- Tri-state already supported: **on-time / qadha / missed**. Per-school point values.
- Singleton: one log per prayer per day. Duplicate-tap protection now built in.

### Attendance
- Per class-day: **present / late / absent**. Absent requires reason text.
- "Hybrid" day (student remote, work submitted from home) marked as `present-remote` for visibility but not absent.
- Late arrival captures actual time.

### Behavior (positive + concerns)
- Already works for parents. Teachers get same surface.
- Per-school behavior catalog defined by Head Teacher during onboarding (concerns + positives, with point values).
- 15-min duplicate-log protection now built in.

### Recognition rewards (school side — replaces consumer rewards)
**Auto-awarded badges:**
- ¼ Juz / ½ Juz / 1 Juz / 5 Juz / 10 / 15 / 20 / 30 (Hafiz)
- 30-day Fajr streak, 30-day perfect-attendance, 90-day no-concerns
- Subject-specific: "Math Star of the Week," "Top Quranic Arabic Score"

**Teacher / Principal commendations** (manual):
- "Principal's Letter to Parents" — printable PDF, school letterhead
- "Lead the dua" / "Lead class line" privileges
- Class privilege of the day (drawn from a school-defined list)

**Leaderboards:**
- Class top-3 by points this week / month. **No bottom-of-class display, ever.**
- Per-campus Hifz milestones board (anonymized to first name + last initial unless principal opts otherwise)

**Optional v1.5 — class budget:**
- Principal sets a per-class term stipend (e.g. PKR 500) for stationery/snack rewards. Teacher spends it down. App tracks the wallet. **Skip unless principal asks for it.**

## 4. Hifz students — additional tracking

Three concepts, universal in Pakistani Hifz tradition. App stores them structured, not free-text.

### Sabaq (new lesson)
- Logged daily by qari.
- Fields: surah, ayah range OR juz + page (school picks one input style during onboarding), tajweed rating (1–5, optional), notes.
- Awards points per the school's sabaq policy.

### Sabaq-para (recent ~7 days revision)
- Logged when revised. Defaults to "today's sabaq-para covers the last 7 sabaqs" — qari can adjust.
- Quality marker, not a fixed point value.

### Manzil (one of 7 classical manzils)
- Long-term revision cycle.
- App shows which manzil is "due next" based on last logged date. Qari confirms when covered.

### Hifz progress visualization
- Bar showing juz completed (1–30).
- Streak: consecutive days of sabaq logged.
- Days-since-last-manzil-revision per manzil (so nothing falls through cracks).

## 5. Mainstream students — additional tracking

### Daily class diary (per subject)
- Class teacher writes a 1–3 sentence summary of what was covered, per subject taught that day.
- Parents see this in their child's feed. Replaces the WhatsApp "homework photo" tradition.

### Homework
- Posted with: subject, description, due date, optional file/photo.
- Parents see; student marks done (or parent does); teacher confirms.

### Assignments
- Bigger than homework (project, essay). Same fields + grading.
- Tracked separately so they show up on the term report.

### Test scores
- Teacher enters: test name, subject, max, scored. Optional rubric.
- Visible to parent immediately.

### What we are **NOT** building in v1
- File upload / submission flow (just photo attach OK)
- Online exam runner
- Grade-curve calculation
- Auto-report-card PDF (manual export only; auto in v2)

## 6. What parents see

Single timeline per child:
- Sabaq · qari · 2:14 PM · +5 pts
- Maghrib · on-time · mother · 7:30 PM · +1 pt
- Math homework posted · due tomorrow
- Concern: "Did not finish classwork" · teacher · −2 pts
- Test: Quranic Arabic 18/20

Parents can filter by source (school / home), date range, subject. Parents can comment on a school entry; teacher gets notified. **Parents cannot edit a school entry** — they raise a flag, teacher reviews.

## 7. Onboarding — what the school does before students arrive

To be done by principal + head of teachers in the 2 weeks before school starts:

1. **Create school + campus** (5 min, you do this with them once).
2. **Define behavior catalog** — list of positives (+pts) and concerns (−pts) the school recognizes.
3. **Define Salah policy** — point values for on-time / qadha / missed.
4. **Define reward tiers** — which badges, which privileges, leaderboard frequency.
5. **Create classes** — Grade × Section + class teacher.
6. **Bulk import students** — CSV: name, DOB, parent name, parent phone, parent email, hifz/mainstream track.
7. **Assign qaris to Hifz students** — many-to-many.
8. **Curriculum entry (per teacher, per class)** — free-form. Each teacher enters what they intend to cover for their subject over the year. App provides the container; school owns the content.
9. **Generate parent invite codes** — sent via WhatsApp/SMS by school administration.

## 8. Decisions I need the principal to make

Sign-off items, ordered by importance:

| # | Decision | Default if no answer |
|---|----------|----------------------|
| 1 | School year start/end dates | Aug 2026 – Jun 2027 |
| 2 | Sabaq input style: surah+ayah, OR juz+page? | Surah + ayah (more common) |
| 3 | Reward leaderboard frequency | Weekly + monthly |
| 4 | Show parent the daily class diary, or weekly digest? | Daily |
| 5 | Per-class reward budget (PKR) — enable or skip? | Skip for v1 |
| 6 | Can parents comment on school entries? | Yes |
| 7 | Pilot scope: Hifz section + which mainstream class? | Hifz + one Grade |
| 8 | Pilot duration before expanding to other classes/campuses | 8 weeks |

## 9. Explicitly **out of scope for v1**

State this clearly so the school doesn't expect it:

- iOS native apps (web only — same URL on any device)
- WhatsApp integration (push notifications + SMS only)
- Fee tracking
- Multi-school administration UI (this is a single-school build for the pilot)
- Adventure World gamification zones
- Offline mode (school must have stable Wi-Fi)
- Auto report cards
- Online exam / quiz runner for mainstream subjects
- Student transfer between campuses
- Teacher across multiple campuses
- Tajweed rubric beyond a 1–5 number

These are v2 candidates. **Do not promise any of them.**

## 10. Timeline (high level)

| Weeks from today | Milestone |
|------------------|-----------|
| 1–2 | Spec sign-off with school (this doc) |
| 3 | Postgres schema + migration plan |
| 4–5 | Backend rebuilt on Postgres, family app unchanged |
| 6 | School / class / teacher entities + invites |
| 7 | Teacher surface (roster + logging) |
| 8 | Bulk student import + parent connect |
| 9 | Hifz tracking |
| 10 | School reward / recognition model |
| 11 | Urdu strings + push to parents |
| 12 | Pilot starts at one campus, shadow mode |
| 13 | Fixes from pilot |
| 14 (buffer) | Expand to other classes / campuses if pilot is green |

## 11. What the pilot success criteria look like

End of week 4 of pilot, we should be able to say:
- ≥ 80% of Hifz teachers log sabaq daily without prompting
- ≥ 70% of parents check the app weekly
- < 3 critical bugs per week
- Principal signs off on rollout to remaining classes/campuses

If those aren't met, we extend pilot, not rollout.
