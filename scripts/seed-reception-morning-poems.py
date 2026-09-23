# -*- coding: utf-8 -*-
# Reception "Morning Lesson" — poem captions from the class's printed
# rhymes booklet (8 photos, WhatsApp 23 Sep 2026). Urdu poems first,
# then English, in booklet order. Reception has no assessments ->
# topics carry no academic_term_id (Junior AV-poems precedent).
# Idempotent: skips topics whose name already exists.
#
#   python scripts/seed-reception-morning-poems.py [--apply]
import io, json, sys, urllib.request

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

# Booklet captions, as printed on each poem's red pill. Two captions
# were part-hidden by the binding and are inferred from the poem text;
# titles are editable in the syllabus UI.
URDU = [
    "نظم: بادل گرجے",
    "نظم: کالی کالی بھیڑوں",
    "نظم: مچھلی",
    "نظم: چھوٹا سا مکوڑا",
    "نظم: مگرمچھ",            # caption part-hidden; poem is اگر نگر کے میاں مگرمچھ
    "نظم: لال لال ٹماٹر",
    "نظم: انجن",
    "نظم: چاند کی پریاں",
    "نظم: تیتر اور چکور",
    "نظم: بچے بچے",           # ducklings poem; caption reads as its refrain
]
ENGLISH = [
    "Poem: Tap Tap Tap",       # caption part-hidden; two little hands go clap clap clap
    "Poem: Baby Baby Yes Mama",
    "Poem: Twinkle Twinkle",
    "Poem: Cobbler Cobbler",
    "Poem: Teddy Bear, Teddy Bear",
    "Poem: Bits of Paper",
    "Poem: One Two Three Four",
    "Poem: Yellow Yellow Yellow",
]
TOPICS = URDU + ENGLISH

# admin user for created_by
users = json.load(urllib.request.urlopen(urllib.request.Request(
    URL + '/auth/v1/admin/users?per_page=1000', headers=H)))
admin_user = next(u for u in users['users'] if (u.get('email') or '').lower() == 'muneeb@azality.com')

cls = req('GET', f"class?org_id=eq.{ORG}&name=eq.Reception&select=id")[0]
cs = req('GET', f"class_subject?class_id=eq.{cls['id']}&name=eq.Morning%20Lesson&archived_at=is.null&select=id")[0]
cur = req('GET', f"curriculum?class_subject_id=eq.{cs['id']}&academic_year=eq.2026-27&select=id")
if cur:
    cur = cur[0]
else:
    print('curriculum missing -> creating')
    if APPLY:
        cur = req('POST', 'curriculum', {
            'org_id': ORG, 'class_subject_id': cs['id'], 'academic_year': '2026-27',
            'title': 'Morning Lesson · 2026-27',
            'description': 'Poem captions from the Reception rhymes booklet (23 Sep 2026), Urdu then English. Reception has no assessments.',
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
