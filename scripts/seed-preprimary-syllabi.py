# -*- coding: utf-8 -*-
# Pre-primary syllabi from the school's sheets (WhatsApp, 10 Sep 2026):
#
#   1. Class Senior - printed "2nd Assessment syllabus" sheet  -> term-scoped
#      to 2nd Assessment, continuing the 1st-Assessment topics already loaded.
#   2. Junior English - handwritten 3-page detailed list. Junior has no
#      assessments (its syllabus is the whole year), so NO term id, matching
#      every other Junior subject. Muneeb: "what we had before was high level,
#      this is much detailed... for them it's a whole assessment".
#   3. Reception + Senior "material work" lists -> Material Activity,
#      whole-year (the school did not tie them to an assessment).
#
# Idempotent: a topic whose name already exists in that curriculum is skipped,
# so re-running adds only what is missing. Nothing is ever deleted - Junior's
# 7 older high-level English topics stay because 3 lessons reference them.
#
#   python scripts/seed-preprimary-syllabi.py            # dry run
#   python scripts/seed-preprimary-syllabi.py --apply
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

FORMATION_RHYMES = "\n".join([
    'c is curvy "c".', 'o is round and round.',
    'a is make a "c", go up and come down.', 'l is down and down.',
    'd is make a "c", go up up and come down.',
    'g is make a "c", go up and come down down and turn a little.',
    'n is down and bumpty.', 'm is down and bumpty and bumpty.',
    'r is down, goes up and turn a little.', 'h is down and down then bumpty.',
    'b is down and down, go up and turn around.',
    't is down and down, turn a little with a line across.',
    'u is down, turn go up and come down.',
    'f is like a walking stick with a line across.',
    'j is down and down then turn a little with a dot.',
    'k is down and down and give it a kick.', 's is like a snake.',
    'i is down with a dot.', 'e is draw an eye and turn a little.',
    'p is down and down, goes up, up and turn around.',
    'y make a "v". come down down.', 'v is for victory.',
    'q is make a "c" go up, come down down and give it a kick.',
    'w is like a zig zag.', 'x is make a cross.', 'z is like a zebra crossing.',
])

# (class, subject, term-name or None, [topic names])
PLAN = [
    # ---------- Class Senior, 2nd Assessment (printed sheet) ----------
    ("Senior", "English Writing", "2nd Assessment", [
        "Fruits name", "Vegetable names", "Pet and wild animals name",
        "Birds name", "Seasons name", "Singular / plural",
        '"oo" and "ee" words', "What is this?", "What are these?",
    ]),
    ("Senior", "Maths Writing", "2nd Assessment", [
        "Write counting (101 – 150)", "Write backward counting (50 – 1)",
        "Write in words counting (1 – 19)", 'Write "ty" words (20 – 90)',
        "Addition (+)", "Subtraction (−)", "Multiplication (×)",
        "Table of 2 & 3", "Odd & even numbers (1 to 10)",
    ]),
    ("Senior", "1000 Picture Reading (G.K)", "2nd Assessment", [
        "G.K (oral): Wild animals", "G.K (oral): Animals and babies",
        "G.K (oral): Animals and home", "G.K (oral): Animals and foods",
        "G.K (oral): Pet and domestic animals", "G.K (oral): Seasons",
        "1000 Pictures: Going to school", "1000 Pictures: In the class room",
        "1000 Pictures: Lunch break", "1000 Pictures: Out door play time",
        "1000 Pictures: In the kitchen",
    ]),
    ("Senior", "Radiant Way Reading", "2nd Assessment", [
        "Read pages 13 to 25",
    ]),
    ("Senior", "Urdu Writing", "2nd Assessment", [
        "سبزیوں کے نام", "جانوروں کے نام", "واحد / جمع", "یہ کیا ہے؟",
        "حرف توڑنے، حرف جوڑیے", "پالتو جانوروں کے نام", "جنگلی جانوروں کے نام",
        "پرندوں کے نام", "موسموں کے نام", "گنتی ہندسوں میں ۱ تا ۳۰",
    ]),
    ("Senior", "Islamic Studies / English Core readers", "2nd Assessment", [
        "حدیث نمبر 5 تا 7", "سوالات 8 تا 15",
    ]),
    ("Senior", "Deeniyat", "2nd Assessment", [
        "پانچ کلمے", "ایمان مجمل (ترجمہ)", "مسجد میں داخل ہونے کی دعا",
        "مسجد سے باہر نکلتے وقت کی دعا", "کپڑے پہنتے وقت کی دعا",
        "کپڑے اتارتے وقت کی دعا",
    ]),
    # ---------- Junior English, whole year (3 handwritten pages) ----------
    ("Junior", "English Writing", None, [
        "Colour the pictures beginning with the given sound",
        "Match the body parts",
        "Match the pictures with correct beginning sounds and colour them",
        "Circle the correct beginning sound and colour the pictures",
        "Match the sounds with pictures",
        "Write the beginning sounds",
        "Match the similar pictures and colour them with same colour",
        "Write sound a to v",
        "Write sound a to z",
        "Read and colour the picture",
        "Write a to z and circle the vowels",
        'Read and write "a" words',
        'Read and write "e" words',
        'Read and write "i" words',
        'Read and write "o" words',
        'Read and write "u" words',
        "Missing words",
        "Read and write Aa – Zz",
        "Write the missing small letters",
        "Write the missing capital letters",
        "What is your name?",
        "Write alphabets Aa-Bb-Cc-Dd",
        "Write alphabets Ee-Ff-Gg-Hh",
        "Write alphabets Ii-Jj-Kk-Ll",
        "Write alphabets Mm-Nn-Oo-Pp",
        "Write alphabets Qq-Rr-Ss-Tt",
        "Write alphabets Uu-Vv-Ww-Xx",
        "Write alphabets Yy-Zz",
        "Write alphabets Aa – Hh",
        "Write alphabets Aa – Pp",
        "Write alphabets Aa – Tt",
        "Write alphabets Aa – Xx",
    ]),
    # ---------- Material work, whole year ----------
    ("Reception", "Material Activity", None, [
        "Sand letters (English)", "Sand letters (Urdu)", "Sand letters (Maths)",
        "Flash cards", "Metal insets", "Colour tablets", "Threading beads",
        "Pouring activity", "Pink tower", "Long rods", "Brown stairs", "Abacus",
    ]),
    ("Senior", "Material Activity", None, [
        "EPL / practical life: Opening and closing containers",
        "EPL / practical life: Washing hands / practice washing",
        "Sensorial: Pink tower — big to small",
        "Sensorial: Brown stair — thick to thin",
        "Sensorial: Red rods — long to short",
        "Sensorial: Colour tablets — colour matching",
        "Number rods", 'Teen board "ty"', "Moveable alphabet",
    ]),
]

# Topics that carry a long reference text in their description.
DESCRIPTIONS = {
    ("Junior", "English Writing", "Formation rhymes (letter formation)"): FORMATION_RHYMES,
}
PLAN.append(("Junior", "English Writing", None, ["Formation rhymes (letter formation)"]))

users = json.load(urllib.request.urlopen(urllib.request.Request(
    URL + '/auth/v1/admin/users?per_page=1000', headers=H)))
admin_user = next(u for u in users['users']
                  if (u.get('email') or '').lower() == 'muneeb@azality.com')

terms = {t['name']: t['id'] for t in
         req('GET', f"academic_term?org_id=eq.{ORG}&archived_at=is.null&select=id,name")}

total_added = 0
for cls_name, sub_name, term_name, topics in PLAN:
    cls = req('GET', f"class?org_id=eq.{ORG}&name=eq.{q(cls_name)}&select=id")
    if not cls:
        print(f"!! class not found: {cls_name}"); continue
    subs = req('GET', f"class_subject?class_id=eq.{cls[0]['id']}&name=eq.{q(sub_name)}"
                      f"&archived_at=is.null&select=id,name")
    if not subs:
        print(f"!! subject not found: {cls_name} / {sub_name}"); continue
    sub = subs[0]
    cur = req('GET', f"curriculum?class_subject_id=eq.{sub['id']}"
                     f"&academic_year=eq.{q(YEAR)}&select=id")
    if cur:
        cur = cur[0]
    else:
        print(f"   (creating curriculum for {cls_name}/{sub_name})")
        cur = {'id': None}
        if APPLY:
            cur = req('POST', 'curriculum', {
                'org_id': ORG, 'class_subject_id': sub['id'], 'academic_year': YEAR,
                'title': f"{sub_name} · {YEAR}",
                'description': "Loaded from the school's syllabus sheets (10 Sep 2026).",
                'created_by': admin_user['id'],
            }, prefer='return=representation')[0]
    existing = req('GET', f"curriculum_topic?curriculum_id=eq.{cur['id']}"
                          f"&select=name,display_order,academic_term_id") if cur['id'] else []
    term_id = terms.get(term_name) if term_name else None
    # Idempotent PER TERM: a subject legitimately repeats a topic across
    # assessments (Senior practises Addition in both the 1st and the 2nd),
    # so only the same name in the SAME term counts as already loaded.
    have = {(t['name'].strip().lower(), t.get('academic_term_id')) for t in (existing or [])}
    order = max([0] + [t.get('display_order') or 0 for t in (existing or [])]) + 1
    added = []
    for name in topics:
        if (name.strip().lower(), term_id) in have: continue
        added.append(name)
        if APPLY and cur['id']:
            req('POST', 'curriculum_topic', {
                'curriculum_id': cur['id'], 'name': name,
                'description': DESCRIPTIONS.get((cls_name, sub_name, name)),
                'display_order': order,
                'academic_term_id': term_id,
            }, prefer='return=minimal')
        order += 1
    total_added += len(added)
    label = term_name or 'whole-year'
    print(f"{cls_name} / {sub_name} [{label}]: +{len(added)} "
          f"(skipped {len(topics) - len(added)} already there)")
    for a in added: print(f"     + {a}")

print(f"\n{'APPLIED' if APPLY else 'DRY RUN'} — {total_added} topics")
