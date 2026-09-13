# -*- coding: utf-8 -*-
# Junior syllabus batch 2 — Ambreen's notebook photos (WhatsApp, 13 Sep 2026).
# Four subjects in one pass:
#
#   Maths Writing    number-formation rhymes (1-9; the page says "1 till 10"
#                    but no rhyme is written for 10) + the full detailed
#                    tick-list. The six coarse rows from the first load are
#                    retired where the detail supersedes them (never if a
#                    lesson/assignment references them).
#   Islamic Studies  the book's contents page, 17 topics with page numbers.
#                    No curriculum existed - created here.
#   Urdu Writing     the detailed list, the progressive حروف تہجی لکھیں
#                    ranges, and حروف تہجی کی بناوٹ (letter formation, the
#                    Urdu twin of the English formation rhymes).
#   Co-Reader        Muneeb: page-range rows "should be added to khala ka
#                    ghar and aao mil jul ke khele" - تعارف + 8 page ranges
#                    inserted directly after each lesson heading.
#
# Handwriting judgment calls (flagged in the report, easy to fix in the UI):
#   - Maths: the diary shows "Write counting (41-50)" twice around
#     "missing number (1-40)"; loaded once. Diary's closing "Count and
#     write" is covered by the existing "Simple addition — count & write".
#   - Urdu ranges: read as (ا-ح) through (ا-ے), standard order, سین/شین
#     spelled out as the diary writes them.
#   - Urdu بناوٹ: two rows between ی and ے were illegible (likely ھ and ء);
#     36 letters loaded, those two skipped.
#
# Ordering: for each subject the desired final order is computed; existing
# rows that match a desired name are moved into place, missing rows are
# inserted, and kept-but-unmatched rows (referenced or deliberately kept)
# fall to the end. Idempotent by normalized name.
#
#   python scripts/seed-junior-batch2.py            # dry run
#   python scripts/seed-junior-batch2.py --apply
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
def norm(s): return ' '.join(s.split()).rstrip('.').lower()

# ── Content ─────────────────────────────────────────────────────────────

NUMBER_RHYMES = [
    "1 is down and down",
    "2 is round & sitting down",
    "3 is round & round",
    "4 is down, go to straight and down & down",
    "5 has a down, big tummy with a cap",
    "6 is slant down & turn around",
    "7 is go to straight & slant down",
    "8 is like a snake with two (2) eggs",
    "9 is round, goes up & come down",
]

MATHS_LIST = [
    "Match the correct number",
    "Count and write number",
    "Write number (1 – 5)",
    "Write number (1 – 9)",
    "Write number 10 & given concept T.U",
    "Write counting (1 – 10)",
    "Count and write counting (11 – 15)",
    "Count and write counting (16 – 20)",
    "Write counting (11 – 20)",
    "Write the missing number (1 – 20)",
    "Write before, between and after",
    "Write counting (21 – 30)",
    "Write counting (1 – 30)",
    "Write counting (31 – 40)",
    "Write the missing numbers (1 – 30)",
    "Write counting (41 – 50)",
    "Write the missing number (1 – 40)",
    "Write counting (31 – 50)",
    "Write the missing number (1 – 50)",
    "Write counting (51 – 60)",
    "Write counting (61 – 70)",
    "Write the missing number (31 – 60)",
    "Write counting (71 – 80)",
    "What comes before",
    "Write counting (51 – 80)",
    "Write counting (81 – 90)",
    "Write missing numbers (61 – 90)",
    "Write counting (91 – 100)",
    "Fill in the missing number (41 – 80)",
    "Write missing number (51 – 100)",
] + [
    "In words counting: %d = %s" % (i, w) for i, w in enumerate(
        ["One", "Two", "Three", "Four", "Five", "Six", "Seven",
         "Eight", "Nine", "Ten"], start=1)
] + [
    "Write in words (6 – 10)",
    "Write in words (1 – 5)",
    "Write backward counting (10 – 1)",
    "Write backward counting (20 – 11)",
    "Write backward counting (30 – 21)",
    "Write backward counting (30 – 1)",
    "Shape name: Circle",
    "Shape name: Square",
    "Shape name: Triangle",
]

# Retired only if no lesson/assignment references them; "Simple addition —
# count & write" is kept on purpose (it covers the diary's "Count and write").
MATHS_RETIRE = [
    "Number writing in figures (1 – 100) — IFS worksheets",
    "Backward counting (30 – 1)",
    "Write in words (1 – 10)",
    "What comes after / write missing numbers",
]

ISLAMIC = [
    ("Salam", 4), ("I am a Muslim", 5), ("Kalimah Tayyibah", 6),
    ("Manners: Before sleeping", 7), ("Allah made me", 8),
    ("Allah made everything", 9), ("Our beloved Prophet صلى الله علیہ وآلہ وسلم", 10),
    ("Manners: Before doing any work", 11), ("Manners: Before eating", 12),
    ("Manners: Sorry", 13), ("Manners: Thank you", 14), ("Qur'an", 15),
    ("Surah Al-Kawthar", 16), ("We love Allah and Muhammad صلى الله علیہ وآلہ وسلم", 17),
    ("Manners: Saying", 18), ("Manners: Du'a for knowledge", 19),
    ("Salah (Namaz)", 20),
]
ISLAMIC_TOPICS = ["%s (p. %d)" % (n, p) for n, p in ISLAMIC]

# Urdu — حروف تہجی کی بناوٹ (letter formation). Verbatim from the notebook;
# two illegible rows between ی and ے (likely ھ and ء) are NOT loaded.
BUNAWAT = [
    ("ا", "نقطے سے نیچے آئیں اور رک جائیں۔"),
    ("ب", "نقطے سے نیچے آئیں، دائیں سے بائیں کشتی بنائیں۔ ب کے نیچے ایک نقطہ لگائیں۔"),
    ("پ", "نقطے سے نیچے آئیں، دائیں سے بائیں کشتی بنائیں۔ پ کے نیچے تین نقطے لگائیں۔"),
    ("ت", "نقطے سے نیچے آئیں، دائیں سے بائیں کشتی بنائیں۔ ت کے اوپر دو نقطے لگائیں۔"),
    ("ٹ", "نقطے سے نیچے آئیں، دائیں سے بائیں کشتی بنائیں، اوپر چھوٹی «ط» بنائیں۔"),
    ("ث", "نقطے سے نیچے آئیں، دائیں سے بائیں کشتی بنائیں اور تین نقطے لگائیں۔"),
    ("ج", "نقطے سے اوپر جائیں، تھوڑا سیدھے آئیں، ایک گول چاند بنائیں۔ ج کے پیٹ میں ایک نقطہ لگائیں۔"),
    ("چ", "نقطے سے اوپر جائیں، تھوڑا سیدھے آئیں، ایک گول چاند بنائیں۔ چ کے اندر تین نقطے لگائیں۔"),
    ("ح", "نقطے سے اوپر جائیں، تھوڑا نیچے آئیں، ایک گول چاند بنائیں۔ ح خالی ہوتا ہے۔"),
    ("خ", "نقطے سے اوپر جائیں، تھوڑا سیدھے آئیں، ایک گول چاند بنائیں، اوپر ایک نقطہ لگائیں۔"),
    ("د", "د کی کمر کو گول بنائیں۔"),
    ("ڈ", "ڈ کی کمر کو گول بنائیں، اوپر ایک چھوٹی «ط» بنائیں۔"),
    ("ذ", "ذ کی کمر کو گول بنائیں، اوپر ایک نقطہ لگائیں۔"),
    ("ر", "نقطے سے نیچے آئیں، تھوڑا آگے جھکا جائیں۔"),
    ("ڑ", "نقطے سے نیچے آئیں، تھوڑا آگے جھکا جائیں، اوپر چھوٹی «ط» بنائیں۔"),
    ("ز", "نقطے سے نیچے آئیں، تھوڑا آگے جھکا جائیں، اوپر ایک نقطہ لگائیں۔"),
    ("ژ", "نقطے سے نیچے آئیں، تھوڑا آگے جھکا جائیں اور تین نقطے لگائیں۔"),
    ("س", "دو چھوٹے پیالے بنائیں، ایک بڑا پیالہ بنائیں۔"),
    ("ش", "دو چھوٹے پیالے بنائیں، ایک بڑا پیالہ بنائیں، اوپر تین نقطے لگائیں۔"),
    ("ص", "ایک ترچھی آنکھ بنائیں، تھوڑا آگے جائیں، ایک گول پیالہ بنائیں۔ ص خالی ہوتا ہے۔"),
    ("ض", "ایک ترچھی آنکھ بنائیں، تھوڑا آگے جائیں، ایک گول پیالہ بنائیں، ض کے اوپر ایک نقطہ لگائیں۔"),
    ("ط", "نقطے سے نیچے آئیں، ترچھا جائیں، ایک ترچھی آنکھ «ص» بنائیں۔"),
    ("ظ", "نقطے سے نیچے آئیں، ترچھا جائیں، ایک ترچھی آنکھ «ص» بنائیں، اوپر ایک نقطہ لگائیں۔"),
    ("ع", "ایک چھوٹا چاند بنائیں، ایک بڑا چاند بنائیں۔"),
    ("غ", "ایک چھوٹا چاند بنائیں، ایک بڑا چاند بنائیں، اوپر ایک نقطہ لگائیں۔"),
    ("ف", "ایک گول سر بنائیں، نیچے آئیں، دائیں سے بائیں کشتی بنائیں، اوپر ایک نقطہ لگائیں۔"),
    ("ق", "ایک گول سر بنائیں، نیچے آئیں، ایک گول پیالہ بنائیں۔"),
    ("ک", "نقطے سے نیچے آئیں، دائیں سے بائیں کشتی بنائیں، اوپر ایک مرکز لگائیں۔"),
    ("گ", "نقطے سے نیچے آئیں، دائیں سے بائیں کشتی بنائیں، اوپر دو مرکز لگائیں۔"),
    ("ل", "نیچے سے ایک گول پیالہ بنائیں۔"),
    ("م", "نقطے سے ایک گول سر بنائیں، تھوڑا آگے آئیں، نیچے اُتر کر رک جائیں۔"),
    ("ن", "ایک گول پیالہ بنائیں، اوپر ایک نقطہ لگائیں۔"),
    ("و", "گول گھمائیں، و کی کمر کو گول بنائیں۔"),
    ("ہ", "نقطے سے نیچے اُتر کر گول بنائیں، اوپر آ کر رک جائیں۔"),
    ("ی", "ایک چھوٹا چاند بنائیں، ترچھا اُتر کر رک جائیں۔"),
    ("ے", "نقطے سے گول «د» کی شکل جیسا بنائیں، اوپر آئیں، درمیان سے تیر باہر کی طرف بنائیں۔"),
]
BUNAWAT_TOPICS = ["بناوٹ: %s — %s" % (l, t.rstrip("۔")) for l, t in BUNAWAT]

# Progressive alphabet-writing ranges; سین/شین spelled out as the diary
# writes them.
RANGE_ENDS = ["ح", "خ", "د", "ڈ", "ذ", "ر", "ڑ", "ز", "ژ", "سین", "شین",
              "ص", "ض", "ط", "ظ", "ع", "غ", "ف", "ق", "ک", "گ", "ل", "م",
              "ن", "و", "ہ", "ی", "ے"]
RANGE_TOPICS = ["حروف تہجی لکھیں (ا – %s)" % e for e in RANGE_ENDS]

URDU_DETAIL = [
    "الفاظ کو درست تصویر سے ملائیں",
    "تصویر کا پہلا حرف لکھیں",                    # exists - reused in place
    "خالی جگہ پُر کریں (ا – ژ)",
    "خالی جگہ پُر کریں (ا – ض)",
    "خالی جگہ پُر کریں (ا – ق)",
    "حروف تہجی نئی ترتیب پڑھیے، یاد کیجیے اور لکھیے",
    "تصویر دیکھ کر صحیح حرف کے گرد دائرہ بنائیں",
    "نیچے دیے گئے خالی خانوں میں اگلا حرف لکھیں",
    "حروف تہجی کی آدھی اشکال لکھیں",
    "خالی جگہ پُر کریں (ب – ے)",
    "حروف تہجی کی پوری اور آدھی اشکال لکھیں",
    "حروف کو ان کی آدھی اشکال سے ملائیں",
    "گن کر لکھیں کتنے ہیں",
]
# Existing rows that the diary detail supersedes (retire if unreferenced).
URDU_RETIRE = [
    "حروف تہجی کی مکمل اشکال کی پہچان اور لکھائی (ا سے ی تک)",
    "خالی جگہ پُر کریں",
    "حروف تہجی کی پوری اور آدھی اشکال",
]

PAGE_RANGES = [(1, 2), (3, 4), (5, 6), (7, 8), (9, 10), (11, 12), (13, 14), (15, 16)]
def lesson_block(title):
    rows = ["سبق «%s» کا تعارف" % title]
    rows += ["%s (صفحہ %d تا %d)" % (title, a, b) for a, b in PAGE_RANGES]
    return rows

# ── Helpers ─────────────────────────────────────────────────────────────

users = json.load(urllib.request.urlopen(urllib.request.Request(
    URL + '/auth/v1/admin/users?per_page=1000', headers=H)))
admin_user = next(u for u in users['users'] if (u.get('email') or '').lower() == 'muneeb@azality.com')

cls = req('GET', f"class?org_id=eq.{ORG}&name=eq.Junior&select=id")[0]

def get_subject(name):
    return req('GET', f"class_subject?class_id=eq.{cls['id']}&name=eq.{q(name)}"
                      f"&archived_at=is.null&select=id")[0]

def get_or_create_curriculum(cs_id, title, desc):
    rows = req('GET', f"curriculum?class_subject_id=eq.{cs_id}&academic_year=eq.{q(YEAR)}&select=id")
    if rows: return rows[0]
    print(f"   curriculum missing -> creating: {title}")
    if not APPLY: return None
    return req('POST', 'curriculum', {
        'org_id': ORG, 'class_subject_id': cs_id, 'academic_year': YEAR,
        'title': title, 'description': desc, 'created_by': admin_user['id'],
    }, prefer='return=representation')[0]

def referenced(topic_id):
    return len(req('GET', f"lesson?curriculum_topic_id=eq.{topic_id}&select=id") or []) \
         + len(req('GET', f"assignment?curriculum_topic_id=eq.{topic_id}&select=id") or [])

def sync(label, cur, desired, retire=()):
    """Bring the curriculum's topic list to `desired` order: reuse matching
    rows (fix display_order), insert missing, retire superseded unreferenced
    rows, push everything else to the end in its old order."""
    existing = req('GET', f"curriculum_topic?curriculum_id=eq.{cur['id']}"
                          f"&select=id,name,display_order&order=display_order") if cur else []
    existing = existing or []
    by_name = {}
    for t in existing:
        by_name.setdefault(norm(t['name']), t)

    added = moved = removed = kept_refd = 0
    for t in existing:
        if norm(t['name']) in {norm(r) for r in retire}:
            refs = referenced(t['id'])
            if refs:
                print(f"   KEEPING (referenced x{refs}): {t['name']}")
                kept_refd += 1
            else:
                print(f"   - retire: {t['name']}")
                removed += 1
                if APPLY: req('DELETE', f"curriculum_topic?id=eq.{t['id']}")
                by_name.pop(norm(t['name']), None)

    used = set()
    order = 0
    for name in desired:
        row = by_name.get(norm(name))
        if row and row['id'] not in used:
            used.add(row['id'])
            if row['display_order'] != order:
                moved += 1
                if APPLY:
                    req('PATCH', f"curriculum_topic?id=eq.{row['id']}",
                        {'display_order': order}, prefer='return=minimal')
        else:
            print(f"   + {name}")
            added += 1
            if APPLY:
                req('POST', 'curriculum_topic', {
                    'curriculum_id': cur['id'], 'name': name,
                    'display_order': order, 'academic_term_id': None,
                }, prefer='return=minimal')
        order += 1
    # leftovers (kept coarse rows, anything else) after the desired list
    for t in existing:
        if t['id'] in used: continue
        if norm(t['name']) in {norm(r) for r in retire} and not referenced(t['id']):
            continue  # already deleted above
        if t['display_order'] < order or True:
            if APPLY:
                req('PATCH', f"curriculum_topic?id=eq.{t['id']}",
                    {'display_order': order}, prefer='return=minimal')
            order += 1
    print(f"   {label}: +{added} added, {moved} reordered, {removed} retired, {kept_refd} kept (referenced)")

# ── Run ─────────────────────────────────────────────────────────────────

print("== Maths Writing ==")
cs = get_subject('Maths Writing')
cur = req('GET', f"curriculum?class_subject_id=eq.{cs['id']}&academic_year=eq.{q(YEAR)}&select=id")[0]
maths_desired = ["Number formation rhyme: %s" % r for r in NUMBER_RHYMES] + MATHS_LIST
sync('Maths Writing', cur, maths_desired, retire=MATHS_RETIRE)

print("== Islamic Studies ==")
cs = get_subject('Islamic Studies')
cur = get_or_create_curriculum(cs['id'], f"Islamic Studies · {YEAR}",
    "Book contents (17 lessons with page numbers) from the head teacher, 13 Sep 2026. Junior has no assessments.")
if cur:
    sync('Islamic Studies', cur, ISLAMIC_TOPICS)
else:
    print("   (dry run: curriculum would be created with 17 topics)")

print("== Urdu Writing ==")
cs = get_subject('Urdu Writing')
cur = req('GET', f"curriculum?class_subject_id=eq.{cs['id']}&academic_year=eq.{q(YEAR)}&select=id")[0]
urdu_desired = BUNAWAT_TOPICS + RANGE_TOPICS + URDU_DETAIL
sync('Urdu Writing', cur, urdu_desired, retire=URDU_RETIRE)

print("== Co-Reader (English/Urdu) ==")
cs = get_subject('Co-Reader (English/Urdu)')
cur = req('GET', f"curriculum?class_subject_id=eq.{cs['id']}&academic_year=eq.{q(YEAR)}&select=id")[0]
coreader_desired = (
    ["خالہ کا گھر"] + lesson_block("خالہ کا گھر") +
    ["آؤ مل جل کر کھیلیں"] + lesson_block("آؤ مل جل کر کھیلیں") +
    ["A Cat in the Tree (ORT Stage 3 Book)", "Nobody wanted to play (ORT Stage 3 Book)",
     "On the Sand (ORT Stage 3 Book)", "The Rope Swing (ORT Stage 3 Book)",
     "The Egg Hunt (ORT Stage 3 Book)", "By the Stream (ORT stage 3 Book)"]
)
sync('Co-Reader', cur, coreader_desired)

print("\n" + ("APPLIED" if APPLY else "DRY RUN - re-run with --apply"))
