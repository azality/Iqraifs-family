# -*- coding: utf-8 -*-
# Senior Deeniyat, 1st Assessment - the notebook detail (Ambreen's
# قرآن سلیبس pages, WhatsApp 14 Sep 2026), completing what #569 did for
# the 2nd Assessment and #590 moved in from Islamic Studies.
#
# What the pages add:
#   - The THREE 1st-Assessment duas get their Arabic texts (reference
#     descriptions, like the 2nd-Assessment duas already have).
#   - "حدیث نمبر 1، 2، 3" becomes FOUR tickable ahadith with meanings -
#     the notebook lists four, which also answers our open "where is
#     hadith 4?" question: numbering runs 1-4 here, then 5-7 in the
#     2nd Assessment (الحمى، السلام، من غش).
#   - "سوالات 1 تا 7" becomes seven tickable questions with answers.
#   - 2nd Assessment: "پانچ کلمے" renamed "پانچواں کلمہ" - the fifth
#     kalima (kalimas 1-4 are the 1st Assessment's), as the notebook
#     writes it.
#
# Still open with the school: سوال ۱۵ has no text anywhere yet; the
# 2nd-Assessment page's last margin number could read 14 or 16 - the
# Kaba question stays numbered ۱۴ as loaded until the school confirms.
#
# No lessons/assignments/resources reference any replaced row (checked
# live before writing this). Idempotent by name.
#
#   python scripts/seed-senior-deeniyat-1st.py            # dry run
#   python scripts/seed-senior-deeniyat-1st.py --apply
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
H = {'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json'}

def req(method, path, body=None, prefer=None):
    h = dict(H)
    if prefer: h['Prefer'] = prefer
    r = urllib.request.Request(URL + '/rest/v1/' + path, method=method,
        data=json.dumps(body).encode() if body is not None else None, headers=h)
    with urllib.request.urlopen(r) as resp:
        t = resp.read().decode()
        return json.loads(t) if t.strip() else None

def act(msg, fn):
    print(("  APPLY " if APPLY else "  would ") + msg)
    return fn() if APPLY else None

CUR = '8747f93c-c08e-4b2d-978b-9e2d22cf4392'   # Senior Deeniyat · 2026-27
TERM1 = 'bf5b7d7b-81be-443b-b065-e3f8972de08a'  # 1st Assessment

DUA_TEXTS = {
    "صبح شام کی خاص دعا":
        "بِسْمِ اللّٰهِ الَّذِيْ لَا يَضُرُّ مَعَ اسْمِهٖ شَيْءٌ فِي الْاَرْضِ وَلَا فِي السَّمَآءِ وَهُوَ السَّمِيْعُ الْعَلِيْمُ",
    "سواری پر سوار ہوتے وقت کی دعا":
        "سُبْحٰنَ الَّذِيْ سَخَّرَ لَنَا هٰذَا وَمَا كُنَّا لَهٗ مُقْرِنِيْنَ وَاِنَّاۤ اِلٰى رَبِّنَا لَمُنْقَلِبُوْنَ",
    "سواری سے اترتے وقت کی دعا":
        "رَبِّ اَنْزِلْنِيْ مُنْزَلًا مُّبَارَكًا وَّاَنْتَ خَيْرُ الْمُنْزِلِيْنَ",
}

# (name, description) - verbatim from the notebook.
NEW_TOPICS = [
    ("حدیث: اَلدِّيْنُ النَّصِيْحَةُ", "دین خیر خواہی کا نام ہے"),
    ("حدیث: اَلْخَالَةُ بِمَنْزِلَةِ الْاُمِّ", "خالہ ماں کے قائم مقام ہے"),
    ("حدیث: اَلْمَجَالِسُ بِالْاَمَانَةِ", "مجالس امانت ہے"),
    ("حدیث: اَلصَّوْمُ جُنَّةٌ", "روزہ ڈھال ہے (عذاب سے بچنے)"),
    ("سوال ۱: اللہ تعالیٰ کون ہے؟", "اللہ تعالیٰ ہم سب کا مالک ہے"),
    ("سوال ۲: کیا اللہ تعالیٰ ایک ہے؟", "جی ہاں"),
    ("سوال ۳: کیا اللہ تعالیٰ کا کوئی شریک ہے؟", "جی نہیں"),
    ("سوال ۴: ساری دنیا کو کس نے بنایا؟", "اللہ تعالیٰ نے"),
    ("سوال ۵: ہم کون ہیں؟", "الحمد للہ ہم سب مسلمان ہیں"),
    ("سوال ۶: ہمارا مذہب کیا ہے؟", "ہمارا مذہب اسلام ہے"),
    ("سوال ۷: ہر کام شروع کرنے سے پہلے کیا کرنا چاہیے؟",
     "ہر کام شروع کرنے سے پہلے بسم اللہ الرحمٰن الرحیم پڑھنا چاہیے"),
]
SUMMARY_ROWS = ["حدیث نمبر 1، 2، 3", "سوالات 1 تا 7"]
RENAME_2ND = ("پانچ کلمے", "پانچواں کلمہ")

def topics():
    return req('GET', f"curriculum_topic?curriculum_id=eq.{CUR}&select=*&order=display_order")

def unreferenced(tid):
    return not (req('GET', f"lesson?curriculum_topic_id=eq.{tid}&select=id")
                or req('GET', f"assignment?curriculum_topic_id=eq.{tid}&select=id")
                or req('GET', f"topic_resource?curriculum_topic_id=eq.{tid}&select=id"))

tops = topics()
by_name = {t['name']: t for t in tops}

# 1. Dua texts onto the existing 1st-Assessment topics.
print("dua texts")
for name, text in DUA_TEXTS.items():
    t = by_name.get(name)
    if not t:
        print(f"  ! {name!r} not found - skipped"); continue
    if t['description'] == text:
        print(f"  = {name!r} already has its text"); continue
    act(f"attach text to {name!r}",
        lambda t=t, text=text: req('PATCH', f"curriculum_topic?id=eq.{t['id']}",
            {'description': text}, prefer='return=minimal'))

# 2. Replace the two summary rows with the detailed list, at their spot.
print("\nahadith + questions")
missing = [n for n, _ in NEW_TOPICS if n not in by_name]
if not missing:
    print("  = all detailed rows already present")
else:
    summaries = [by_name[n] for n in SUMMARY_ROWS if n in by_name]
    insert_at = min((t['display_order'] for t in summaries), default=None)
    if insert_at is None:
        # Summaries already gone: append the missing rows after the last
        # 1st-Assessment row.
        insert_at = max((t['display_order'] for t in tops
                         if t['academic_term_id'] == TERM1), default=-1) + 1
    shift = len(missing) - len(summaries)
    if shift > 0:
        for t in sorted([t for t in tops if t['display_order'] >= insert_at
                         and t['name'] not in SUMMARY_ROWS], key=lambda t: -t['display_order']):
            act(f"shift {t['name']!r} {t['display_order']} -> {t['display_order'] + shift}",
                lambda t=t: req('PATCH', f"curriculum_topic?id=eq.{t['id']}",
                    {'display_order': t['display_order'] + shift}, prefer='return=minimal'))
    for t in summaries:
        assert unreferenced(t['id']), f"{t['name']!r} is referenced - stop"
        act(f"remove summary row {t['name']!r}",
            lambda t=t: req('DELETE', f"curriculum_topic?id=eq.{t['id']}", prefer='return=minimal'))
    for i, (name, desc) in enumerate(NEW_TOPICS):
        if name in by_name: continue
        act(f"add [{insert_at + i}] {name!r}",
            lambda name=name, desc=desc, i=i: req('POST', 'curriculum_topic', {
                'curriculum_id': CUR, 'name': name, 'description': desc,
                'display_order': insert_at + i, 'academic_term_id': TERM1, 'completed': False,
            }, prefer='return=minimal'))

# 3. The fifth kalima, as the notebook writes it.
print("\n2nd Assessment rename")
old, new = RENAME_2ND
t = by_name.get(old)
if t:
    act(f"rename {old!r} -> {new!r}",
        lambda t=t: req('PATCH', f"curriculum_topic?id=eq.{t['id']}",
            {'name': new}, prefer='return=minimal'))
elif new in by_name:
    print(f"  = already renamed")
else:
    print(f"  ! neither {old!r} nor {new!r} found")

if not APPLY:
    print("\nDRY RUN - re-run with --apply")
    sys.exit(0)

print("\nSenior Deeniyat now:")
T = {TERM1: '1st'}
for t in topics():
    print(f"  {t['display_order']:>2} [{T.get(t['academic_term_id'], '2nd')}] {t['name']}")
