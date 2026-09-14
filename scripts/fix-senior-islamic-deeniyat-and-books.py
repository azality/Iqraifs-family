# -*- coding: utf-8 -*-
# Senior Islamic Studies vs Deeniyat, plus two book contents pages
# (head teacher, WhatsApp 14 Sep 2026).
#
# 1. Senior "Islamic Studies / English Core readers" held four Urdu rows -
#    ahadith and oral questions - that are DEENIYAT's syllabus (Muneeb:
#    "none of them were part of Islamic Studies rather they are part of
#    Deeniyat"). How it happened: both school sheets listed them under an
#    "Islamic Studies" heading, and both loaders filed rows by the sheet's
#    heading - seed-junior-senior-syllabus.ts (24 Aug, exact subject-name
#    match, the subject was then still called "Islamic Studies") and
#    seed-preprimary-syllabi.py (10 Sep, continuing into the same subject).
#    Neither checked the content against the timetable, which separates
#    "Islamic Studies Reading" (the English book) from "Deeniyat Book".
#
#      1st Assessment  حدیث نمبر 1، 2، 3 / سوالات 1 تا 7
#          -> MOVED to Deeniyat, after its 1st-Assessment rows.
#      2nd Assessment  حدیث نمبر 5 تا 7 / سوالات 8 تا 15
#          -> Deeniyat already has them broken out one per row (#569: the
#             three ahadith and questions 8-14), so the two summary rows
#             are removed rather than listed twice. Question 15 had no row
#             of its own - added as "سوال ۱۵" (answer not in the notebook).
#    Safe: no lessons, assignments or resources on any of the four.
#
# 2. Senior Islamic Studies - the English book's contents page, page
#    numbers as printed. 1st Assessment ends with Surah Al-Ikhlas; 2nd
#    Assessment starts at Durood Shareef. The photo cuts off after
#    "Manners: Thank you and sorry" (a "Kabah" row is half visible) -
#    loaded up to what is readable.
#
# 3. Junior Environmental Studies (G.K) - whole-year book contents, 15
#    chapters with their starting page. No curriculum existed - created.
#    Junior has no assessments, so no term.
#
# Idempotent by name.
#
#   python scripts/fix-senior-islamic-deeniyat-and-books.py            # dry run
#   python scripts/fix-senior-islamic-deeniyat-and-books.py --apply
import io, json, sys, urllib.request, urllib.parse

APPLY = "--apply" in sys.argv

env = {}
for line in io.open('.env', encoding='utf-8'):
    line = line.strip()
    if '=' in line and not line.startswith('#'):
        k, v = line.split('=', 1)
        env[k] = v.strip().strip('"')
URL = env['SUPABASE_URL'].rstrip('/')
KEY = env['SUPABASE_SERVICE_ROLE_KEY']
ORG = '63cd5732-5db4-40e1-8fb9-60782bcfd059'
YEAR = '2026-27'
H = {'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json'}

def req(method, path, body=None, prefer=None):
    h = dict(H)
    if prefer: h['Prefer'] = prefer
    r = urllib.request.Request(URL + '/rest/v1/' + path, method=method,
        data=json.dumps(body).encode() if body is not None else None, headers=h)
    with urllib.request.urlopen(r) as resp:
        t = resp.read().decode()
        return json.loads(t) if t.strip() else None

def q(s): return urllib.parse.quote(str(s), safe='')

def act(msg, fn):
    print(("  APPLY " if APPLY else "  would ") + msg)
    return fn() if APPLY else None

TERM1 = 'bf5b7d7b-81be-443b-b065-e3f8972de08a'  # 1st Assessment
TERM2 = '22be6208-7665-422e-b094-5de0ef8248bc'  # 2nd Assessment
SENIOR_IS = '82b32160-c8aa-4ae1-a527-6cf31d43d27b'
SENIOR_DEEN = 'f8a7170a-529f-4ad7-a5ca-2a09c99297bb'
JUNIOR_ENV = 'ed9fe01b-9e6e-43a6-929d-09605f5e06b7'
CREATED_BY = 'c5c1f5f2-c24e-4e8a-89d0-f4ca197ade48'
PBUH = 'صلى الله علیہ وآلہ وسلم'  # as written on Junior's Islamic Studies rows

MOVE_TO_DEENIYAT = ['حدیث نمبر 1، 2، 3', 'سوالات 1 تا 7']
SUMMARY_ROWS = ['حدیث نمبر 5 تا 7', 'سوالات 8 تا 15']
Q15 = 'سوال ۱۵'

SENIOR_IS_BOOK = [
    (TERM1, "Salam (p. 4)"),
    (TERM1, "I am a Muslim (p. 5)"),
    (TERM1, "Kalimah Tayyibah & Shahadah (p. 6)"),
    (TERM1, "Allah made me (p. 7)"),
    (TERM1, "Surah Al-Kawthar (p. 8)"),
    (TERM1, f"Our beloved Prophet {PBUH} (p. 9)"),
    (TERM1, "Sunnah of drinking water (p. 10)"),
    (TERM1, "Allah made everything (p. 11)"),
    (TERM1, "Surah Al-Ikhlas (p. 12)"),
    (TERM2, "Durood Shareef (p. 13)"),
    (TERM2, "Almighty Allah (p. 14)"),
    (TERM2, "Sunnah of eating (p. 15)"),
    (TERM2, "Manners: Ascend and descend (p. 16)"),
    (TERM2, "Salah (Namaz) (p. 17)"),
    (TERM2, "Manners: Thank you and sorry (p. 18)"),
]

JUNIOR_ENV_BOOK = [
    "Myself (p. 4)", "My Body (p. 7)", "Meet My Family (p. 11)",
    "Good Habits (p. 15)", "My School (p. 18)", "Beautiful Flowers (p. 23)",
    "Fruits and Vegetables (p. 27)", "Useful Vehicles (p. 35)",
    "The Animal World (p. 42)", "Food (p. 50)", "Seasons (p. 58)",
    "Clothes We Wear (p. 65)", "Our Helpers (p. 71)",
    "Know the Colours (p. 75)", "My Country (p. 83)",
]

def curriculum(cs_id):
    rows = req('GET', f"curriculum?class_subject_id=eq.{cs_id}&academic_year=eq.{q(YEAR)}&select=*")
    return rows[0] if rows else None

def topics(cur_id):
    return req('GET', f"curriculum_topic?curriculum_id=eq.{cur_id}&select=*&order=display_order") if cur_id else []

def unreferenced(topic_id):
    return not (req('GET', f"lesson?curriculum_topic_id=eq.{topic_id}&select=id")
                or req('GET', f"assignment?curriculum_topic_id=eq.{topic_id}&select=id")
                or req('GET', f"topic_resource?curriculum_topic_id=eq.{topic_id}&select=id"))

is_cur = curriculum(SENIOR_IS)
deen_cur = curriculum(SENIOR_DEEN)
assert is_cur and deen_cur, "Senior Islamic Studies / Deeniyat curriculum missing"

# ── 1. Senior: Deeniyat rows out of Islamic Studies ─────────────────────
print("Senior Islamic Studies -> Deeniyat")
is_tops = topics(is_cur['id'])
deen_tops = topics(deen_cur['id'])
deen_names = {t['name'] for t in deen_tops}

# The 1st-Assessment rows go directly after Deeniyat's own 1st-Assessment
# rows; everything after shifts down.
to_move = [t for t in is_tops if t['name'] in MOVE_TO_DEENIYAT and t['name'] not in deen_names]
if to_move:
    last_t1 = max((t['display_order'] for t in deen_tops if t['academic_term_id'] == TERM1), default=-1)
    insert_at = last_t1 + 1
    for t in sorted([t for t in deen_tops if t['display_order'] >= insert_at], key=lambda t: -t['display_order']):
        act(f"shift Deeniyat '{t['name']}' {t['display_order']} -> {t['display_order'] + len(to_move)}",
            lambda t=t: req('PATCH', f"curriculum_topic?id=eq.{t['id']}", {'display_order': t['display_order'] + len(to_move)}, prefer='return=minimal'))
    for i, t in enumerate(sorted(to_move, key=lambda t: MOVE_TO_DEENIYAT.index(t['name']))):
        assert unreferenced(t['id']), f"'{t['name']}' is referenced - stop"
        act(f"move '{t['name']}' to Deeniyat at {insert_at + i} (1st Assessment)",
            lambda t=t, i=i: req('PATCH', f"curriculum_topic?id=eq.{t['id']}",
                {'curriculum_id': deen_cur['id'], 'display_order': insert_at + i}, prefer='return=minimal'))

for t in is_tops:
    if t['name'] in SUMMARY_ROWS:
        assert unreferenced(t['id']), f"'{t['name']}' is referenced - stop"
        act(f"remove summary row '{t['name']}' (Deeniyat has it one per row)",
            lambda t=t: req('DELETE', f"curriculum_topic?id=eq.{t['id']}", prefer='return=minimal'))

if Q15 not in deen_names:
    end = max((t['display_order'] for t in topics(deen_cur['id'])), default=-1) if APPLY else \
          max((t['display_order'] for t in deen_tops), default=-1) + len(to_move)
    act(f"add '{Q15}' to Deeniyat at {end + 1} (2nd Assessment)",
        lambda: req('POST', 'curriculum_topic', {
            'curriculum_id': deen_cur['id'], 'name': Q15, 'display_order': end + 1,
            'academic_term_id': TERM2, 'completed': False,
        }, prefer='return=minimal'))

# ── 2. Senior Islamic Studies: the book ─────────────────────────────────
print("\nSenior Islamic Studies book")
remaining = [t for t in topics(is_cur['id'])] if APPLY else \
    [t for t in is_tops if t['name'] not in MOVE_TO_DEENIYAT + SUMMARY_ROWS]
have = {t['name']: t for t in remaining}
for i, (term, name) in enumerate(SENIOR_IS_BOOK):
    t = have.get(name)
    if t is None:
        act(f"add [{i}] {name} ({'1st' if term == TERM1 else '2nd'} Assessment)",
            lambda term=term, name=name, i=i: req('POST', 'curriculum_topic', {
                'curriculum_id': is_cur['id'], 'name': name, 'display_order': i,
                'academic_term_id': term, 'completed': False,
            }, prefer='return=minimal'))
    elif t['display_order'] != i or t['academic_term_id'] != term:
        act(f"reorder [{i}] {name}",
            lambda t=t, i=i, term=term: req('PATCH', f"curriculum_topic?id=eq.{t['id']}",
                {'display_order': i, 'academic_term_id': term}, prefer='return=minimal'))
IS_DESC = ("Book contents with page numbers (head teacher, 14 Sep 2026): "
           "1st Assessment to Surah Al-Ikhlas, 2nd Assessment from Durood Shareef.")
if is_cur.get('description') != IS_DESC:
    act("update Islamic Studies curriculum description",
        lambda: req('PATCH', f"curriculum?id=eq.{is_cur['id']}", {'description': IS_DESC}, prefer='return=minimal'))

# ── 3. Junior Environmental Studies (G.K) ───────────────────────────────
print("\nJunior Environmental Studies (G.K)")
env_cur = curriculum(JUNIOR_ENV)
if not env_cur:
    env_cur = act("create curriculum 'Environmental Studies (G.K) · 2026-27'",
        lambda: req('POST', 'curriculum', {
            'org_id': ORG, 'class_subject_id': JUNIOR_ENV, 'academic_year': YEAR,
            'title': f"Environmental Studies (G.K) · {YEAR}",
            'description': "Book contents (15 chapters with page numbers) from the head teacher, 14 Sep 2026. Junior has no assessments.",
            'created_by': CREATED_BY,
        }, prefer='return=representation')[0])
env_have = {t['name']: t for t in topics(env_cur['id'])} if env_cur else {}
for i, name in enumerate(JUNIOR_ENV_BOOK):
    t = env_have.get(name)
    if t is None:
        act(f"add [{i}] {name}",
            lambda name=name, i=i: req('POST', 'curriculum_topic', {
                'curriculum_id': env_cur['id'], 'name': name, 'display_order': i, 'completed': False,
            }, prefer='return=minimal'))
    elif t['display_order'] != i:
        act(f"reorder [{i}] {name}",
            lambda t=t, i=i: req('PATCH', f"curriculum_topic?id=eq.{t['id']}", {'display_order': i}, prefer='return=minimal'))

if not APPLY:
    print("\nDRY RUN - re-run with --apply")
    sys.exit(0)

# ── Verify ──────────────────────────────────────────────────────────────
TERMS = {TERM1: '1st', TERM2: '2nd', None: '-'}
for label, cur in (("Senior Islamic Studies", is_cur), ("Senior Deeniyat", deen_cur), ("Junior Environmental Studies", curriculum(JUNIOR_ENV))):
    rows = topics(cur['id'])
    print(f"\n{label}: {len(rows)} topics")
    for t in rows:
        print(f"  {t['display_order']:>2} [{TERMS.get(t['academic_term_id'], '?')}] {t['name']}")
