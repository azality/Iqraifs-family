# School public website — design brief

You are designing a **public marketing website template** for an
education platform that hosts many schools. Each school customizes a
handful of fields; the rest comes live from their school management
app. Your job is to design the front-end the parent sees when they
land on `iqraifs.com/<school-slug>`.

The reference school for this design is **Iqra Academy** — an Islamic
school in Pakistan teaching Hifz (Quran memorization) alongside the
national curriculum, grades 1–7, across 4 campuses. Target audience:
Pakistani Muslim parents who want both deen and dunya for their kids.
Launch: August 2026.

Design against the sample data at the bottom of this file. But the
layout must work for **any** school on the platform — a montessori, a
girls' high school, a tuition center — so don't hardcode anything
Iqra-specific into the structure.

---

## What I want

A modern, warm, premium-feeling public school site with WOW factor.
Think "premium private school site meets thoughtful Islamic
aesthetic" — not stock-photo madrasah and not cold corporate. Subtle
Islamic geometric motifs are welcome (as background patterns or
section dividers), but no clipart minarets.

**Deliverable**: a single self-contained HTML file using Tailwind via
CDN, rendering the full desktop layout populated with the sample data
below. Then a short rationale section at the end explaining your
color, type, and section choices.

**Constraints:**
- Mobile-first responsive, desktop polished
- RTL-ready (Urdu is coming) — use logical CSS properties
- Lazy-load gallery, no heavy hero video
- 4.5:1 contrast, visible focus rings
- A "WhatsApp us" floating button on mobile (matters a lot in Pakistan)
- Trust signals (phone, address, principal photo) discoverable above
  the fold somewhere — Pakistani parents check these

---

## Sections to design

Each section is tagged with the data source:

- **[ADMIN-EDITED]** — comes from the school's CMS form (free text /
  image upload by the principal)
- **[LIVE FROM APP]** — pulled live from the running school app;
  refreshes automatically when the school updates internal records.
  Mark these subtly in your design with a small "● live" indicator or
  inline comment so a school admin reading the page knows which
  sections refresh themselves.

### 1. Hero
- [ADMIN-EDITED] `heroTitle`, `heroTagline`, `heroImageUrl`
- [LIVE FROM APP] school `name`, `logoUrl`, `slug`
- CTAs: "Apply for admission", "Visit a campus"

### 2. Highlights strip (stats)
- [ADMIN-EDITED] up to 6 `highlights` items (label + value)
- Render as animated counters or pill row
- Examples: "4 campuses", "1,200+ students", "50+ Huffaz graduated"

### 3. About
- [ADMIN-EDITED] `about` — multi-paragraph text (mission, why us)
- Pair with a quote / ayah callout for warmth

### 4. School day at a glance
- [LIVE FROM APP] `timings.firstStart`, `timings.lastEnd`,
  `timings.daysOfWeek` — derived from the school's published
  timetable, updates automatically
- Render as a visual day-strip (morning assembly → Quran → academics →
  home)

### 5. Current term banner
- [LIVE FROM APP] `term.name`, `term.startDate`, `term.endDate`
- Small live card: "Term 2 · Jan 6 – Mar 28, 2026"

### 6. What's happening (announcements feed)
- [LIVE FROM APP] up to 5 `announcements` flagged as public (title,
  body excerpt, publishedAt)
- Clean card grid with date stamps

### 7. Programs
- Hand-design three pillars: **Hifz Program**, **Mainstream (Grade
  1–7)**, **Hybrid (Hifz + academics)**. Each with icon, one-line
  summary, "Learn more" anchor.
- Static for v1 — fine.

### 8. Faculty wall
- [ADMIN-EDITED] up to 24 `faculty` (name, role, bio, photoUrl)
- Grid of photo cards with hover bio reveal
- Group by department if there's a clean way to infer it

### 9. Campus gallery
- [ADMIN-EDITED] `gallery` items (url + optional caption)
- Masonry or carousel — Pakistani parents love seeing the actual
  building

### 10. Admissions snapshot
- Static for now: a "How to apply" 3-step visual
- Plus a prominent "Request a visit" form (name, child's grade, phone,
  preferred campus dropdown) — wire to mailto fallback

### 11. Contact
- [ADMIN-EDITED] `contact.phone`, `contact.email`, `contact.address`
- WhatsApp button (Pakistan default), embedded map placeholder, and a
  prayer-time-friendly visit hours note

### 12. Footer
- Quick links, social, copyright. Subtle.

---

## Design system suggestions (you can override)

- **Palette**: deep emerald (`#0F5132` family) + warm cream
  (`#FAF6EE` family) + soft gold accent (`#C9A24A` family). Try this
  first; if you find better, justify it.
- **Type**: a refined serif for headings (Frank Ruhl Libre, Cormorant,
  or DM Serif Display) + a calm sans for body (Inter, Plus Jakarta).
  Pair with one Arabic-script-friendly fallback for the future Urdu
  toggle.
- **Photography style** (note in your rationale, even if you use
  placeholders): warm natural light, students in uniform, no posed
  corporate shots.

---

## Sample data (Iqra Academy — render against this)

```json
{
  "school": {
    "name": "Iqra Academy",
    "slug": "iqra-academy",
    "logoUrl": "https://placehold.co/120x120/0F5132/FAF6EE?text=IA"
  },
  "hero": {
    "title": "Where Quran meets character",
    "tagline": "An Islamic education that takes both deen and dunya seriously — for grades 1 through 7, across four Karachi campuses.",
    "imageUrl": "https://placehold.co/1600x900/0F5132/FAF6EE?text=Iqra+Academy+Campus"
  },
  "highlights": [
    { "label": "Campuses across Karachi", "value": "4" },
    { "label": "Students enrolled", "value": "1,200+" },
    { "label": "Huffaz graduated", "value": "50+" },
    { "label": "Established", "value": "2019" },
    { "label": "Teacher : student ratio", "value": "1 : 18" },
    { "label": "Pakistan curriculum + Hifz", "value": "Grades 1–7" }
  ],
  "about": "Iqra Academy was founded in 2019 by a group of parents who wanted their children to memorize the Quran without falling behind academically. Five years later, our students sit competitive entrance exams alongside huffaz of the Book — and place in both.\n\nWe believe a Pakistani child should not have to choose between deen and dunya. Our day weaves Quran, character, and the national curriculum into a single rhythm. Our teachers are Pakistani educators trained in both fields. Our parents are partners — you'll meet your child's class teacher within the first week.\n\nFour campuses across Karachi mean a family near Gulshan, Bahadurabad, North Nazimabad, or DHA has a seat within reach.",
  "ayahCallout": {
    "arabic": "اقْرَأْ بِاسْمِ رَبِّكَ الَّذِي خَلَقَ",
    "translation": "Read, in the name of your Lord who created.",
    "reference": "Surah Al-‘Alaq, 96:1"
  },
  "live": {
    "timings": {
      "firstStart": "07:30",
      "lastEnd": "14:30",
      "daysOfWeek": [1, 2, 3, 4, 5]
    },
    "term": {
      "name": "Term 2 · 2025–26",
      "startDate": "2026-01-06",
      "endDate": "2026-03-28"
    },
    "announcements": [
      {
        "title": "Parent–teacher conference — Term 2",
        "body": "Sign-ups open for the Term 2 parent–teacher conference, Saturday February 14. Each family gets a 15-minute slot with the class teacher.",
        "publishedAt": "2026-02-01T09:00:00Z"
      },
      {
        "title": "Hifz graduation — Class of 2026",
        "body": "Alhamdulillah, twelve students will complete their Hifz this term. Joining ceremony is Friday March 6, after Asr, at the Bahadurabad campus.",
        "publishedAt": "2026-01-22T11:00:00Z"
      },
      {
        "title": "Admissions for Grade 1 (Aug 2026) now open",
        "body": "Applications for Grade 1 entry in August 2026 are now open at all four campuses. Limited seats — early applicants get campus priority.",
        "publishedAt": "2026-01-10T10:00:00Z"
      },
      {
        "title": "New DHA campus opening Aug 2026",
        "body": "We're opening our fourth campus in DHA Phase 6 in August 2026. Pre-registration of interest is open now.",
        "publishedAt": "2025-12-15T14:00:00Z"
      },
      {
        "title": "Winter uniform reminder",
        "body": "Winter uniforms are required from December 1 through February 28. Available at the campus office, or order online.",
        "publishedAt": "2025-11-20T08:00:00Z"
      }
    ]
  },
  "faculty": [
    { "name": "Ustadh Bilal Ahmed", "role": "Principal · Hifz lead", "bio": "Hafiz of Quran from Jamia Binoria, BA in Education from University of Karachi. Founded Iqra Academy in 2019.", "photoUrl": "https://placehold.co/400x400/0F5132/FAF6EE?text=BA" },
    { "name": "Ustadha Aisha Siddiqui", "role": "Vice Principal · Mainstream", "bio": "M.Ed from IBA, 12 years teaching across Karachi schools. Oversees the Pakistan national curriculum stream.", "photoUrl": "https://placehold.co/400x400/C9A24A/0F5132?text=AS" },
    { "name": "Qari Imran Sheikh", "role": "Senior Quran teacher", "bio": "Hafiz with ijazah in Hafs an Asim. Teaches advanced Hifz across Bahadurabad and Gulshan campuses.", "photoUrl": "https://placehold.co/400x400/0F5132/FAF6EE?text=IS" },
    { "name": "Ms. Hina Raza", "role": "Grade 3 class teacher", "bio": "B.Ed from AKU. Specializes in early literacy and Urdu.", "photoUrl": "https://placehold.co/400x400/C9A24A/0F5132?text=HR" },
    { "name": "Mr. Kamran Ali", "role": "Mathematics · Grade 5–7", "bio": "MSc Mathematics from Karachi University. Olympiad coach.", "photoUrl": "https://placehold.co/400x400/0F5132/FAF6EE?text=KA" },
    { "name": "Ustadha Zara Hussain", "role": "Grade 1 class teacher", "bio": "Early childhood specialist. Eight years with us — since the school's first year.", "photoUrl": "https://placehold.co/400x400/C9A24A/0F5132?text=ZH" }
  ],
  "gallery": [
    { "url": "https://placehold.co/800x600/0F5132/FAF6EE?text=Morning+assembly", "caption": "Morning assembly — Gulshan campus" },
    { "url": "https://placehold.co/800x600/C9A24A/0F5132?text=Hifz+circle", "caption": "Hifz circle, Bahadurabad" },
    { "url": "https://placehold.co/800x600/0F5132/FAF6EE?text=Science+lab", "caption": "Grade 6 science lab" },
    { "url": "https://placehold.co/800x600/C9A24A/0F5132?text=Library", "caption": "Library at North Nazimabad" },
    { "url": "https://placehold.co/800x600/0F5132/FAF6EE?text=Sports+day", "caption": "Inter-campus sports day 2025" },
    { "url": "https://placehold.co/800x600/C9A24A/0F5132?text=Graduation", "caption": "Hifz graduation 2024" }
  ],
  "programs": [
    { "name": "Hifz Program", "summary": "Full-time Quran memorization with daily revision. Most students complete in 3–4 years." },
    { "name": "Mainstream (Grade 1–7)", "summary": "Pakistan national curriculum, English-medium, with Islamic studies and daily Quran." },
    { "name": "Hybrid", "summary": "Half-day Hifz + half-day academics. For students who want both without choosing." }
  ],
  "contact": {
    "phone": "+92 21 1234 5678",
    "whatsapp": "+92 300 1234 567",
    "email": "admissions@iqraifs.com",
    "address": "Main campus: Plot 14, Block 7, Bahadurabad, Karachi. Other campuses: Gulshan-e-Iqbal Block 10, North Nazimabad Block H, DHA Phase 6 (opening Aug 2026).",
    "visitHours": "Mon–Fri, 9:00 AM – 1:00 PM. We pause for Zuhr (~1:00–1:45 PM) and Asr (~4:30–5:00 PM)."
  }
}
```

---

## After you design, tell me

1. **Color & type choices** — why you picked what you picked
2. **What you'd cut for v1 vs v2** if I told you the principal has 30
   minutes to fill the CMS, not 3 hours
3. **Sections I'm missing** for a Pakistani Islamic-school audience
   that you'd add before launch
4. **Variations** — if this same template ran for a Montessori in
   Lahore or a girls' high school in Islamabad, what changes in the
   design and what stays?
