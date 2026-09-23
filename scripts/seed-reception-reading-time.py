# -*- coding: utf-8 -*-
# Reception "Reading Time (English/Urdu/Maths)" — one subject, three
# books (photos, 23 Sep 2026): Spectrum ابتدائی اردو قاعدہ, an English
# alphabet/words book, and a 1-100 numbers book. Topics are teachable
# units prefixed by strand, NOT one per page; Rabia adjusts, renames or
# deletes freely in the syllabus UI - this is a starting point, and the
# books' own contents pages win where they divide differently.
# Reception has no assessments -> no academic_term_id (poems precedent).
# Idempotent: skips topics whose name already exists.
#
#   python scripts/seed-reception-reading-time.py [--apply]
import io, json, sys, urllib.parse, urllib.request

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
H = {'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json'}

def req(method, path, body=None, prefer=None):
    h = dict(H)
    if prefer: h['Prefer'] = prefer
    r = urllib.request.Request(URL + '/rest/v1/' + path, method=method,
        data=json.dumps(body).encode() if body is not None else None, headers=h)
    with urllib.request.urlopen(r) as resp:
        t = resp.read().decode()
        return json.loads(t) if t.strip() else None

TOPICS = [
    "اردو قاعدہ: حروف تہجی ا تا خ",
    "اردو قاعدہ: حروف تہجی د تا ژ",
    "اردو قاعدہ: حروف تہجی س تا غ",
    "اردو قاعدہ: حروف تہجی ف تا ں",
    "اردو قاعدہ: حروف تہجی و تا ے",
    "اردو قاعدہ: آوازیں اور تصویریں",
    # Capitals removed 23 Sep - Rabia: "Capital letters nai hoty inky"
    # (Reception's English book teaches small letters only).
    "English: Small letters a–z",
    "English: Letter sounds and picture words (A for Apple …)",
    "Maths: Numbers 1–10 (recognition and tracing)",
    "Maths: Numbers 11–20 with number words",
    "Maths: Number words One to Twenty",
    "Maths: Numbers 21–50",
    "Maths: Numbers 51–100 (tens: Thirty, Forty … Hundred)",
    "Maths: Counting objects",
    "Maths: Concepts — more and few, big and small",
]

# admin user for created_by
users = json.load(urllib.request.urlopen(urllib.request.Request(
    URL + '/auth/v1/admin/users?per_page=1000', headers=H)))
admin_user = next(u for u in users['users'] if (u.get('email') or '').lower() == 'muneeb@azality.com')

cls = req('GET', f"class?org_id=eq.{ORG}&name=eq.Reception&select=id")[0]
subject_name = urllib.parse.quote("Reading Time (English/Urdu/Maths)")
cs = req('GET', f"class_subject?class_id=eq.{cls['id']}&name=eq.{subject_name}&archived_at=is.null&select=id,name")
if not cs:
    print("subject not found - check the name"); sys.exit(1)
cs = cs[0]
cur = req('GET', f"curriculum?class_subject_id=eq.{cs['id']}&academic_year=eq.2026-27&select=id")
if cur:
    cur = cur[0]
else:
    print('curriculum missing -> creating')
    if APPLY:
        cur = req('POST', 'curriculum', {
            'org_id': ORG, 'class_subject_id': cs['id'], 'academic_year': '2026-27',
            'title': 'Reading Time (English/Urdu/Maths) · 2026-27',
            'description': 'Starter units from the three Reception books (Spectrum Urdu Qaida, English alphabet, 1-100 numbers; photos 23 Sep 2026). The teacher adjusts, renames or deletes freely - the books’ own contents pages win. Reception has no assessments.',
            'created_by': admin_user['id'],
        }, prefer='return=representation')[0]
    else:
        cur = None

existing = req('GET', f"curriculum_topic?curriculum_id=eq.{cur['id']}&select=name,display_order") if cur else []
have = {t['name'].strip().lower() for t in (existing or [])}
order = max([0] + [t.get('display_order') or 0 for t in (existing or [])]) + 1

added = 0
for name in TOPICS:
    if name.strip().lower() in have:
        continue
    print(('ADD ' if APPLY else 'would add ') + name)
    if APPLY:
        req('POST', 'curriculum_topic', {
            'curriculum_id': cur['id'], 'name': name, 'description': None,
            'display_order': order, 'academic_term_id': None,
        }, prefer='return=minimal')
    order += 1
    added += 1
print(('APPLIED' if APPLY else 'DRY RUN') + f": +{added} topics (skipped {len(TOPICS)-added})")
