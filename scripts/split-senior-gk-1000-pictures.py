# -*- coding: utf-8 -*-
# Senior: "1000 Picture Reading (G.K)" becomes two subjects, each oral /10
# (school request, 14 Sep 2026: "split this into two and each to have 10
# marks"). It was one subject with two oral components summed into a single
# /20 box on the marks sheet.
#
#   1000 Picture Reading  (the existing row, renamed) - oral /10
#       keeps the shared Mon-Thu 11:45 period, both logged lessons (both on
#       "The family") and the 8 "1000 Pictures" topics
#   G.K                   (new subject) - oral /10
#       same teachers per section, gets the 9 "G.K" topics
#
# Safe because nothing depends on the /20 shape yet: no exam_subject_score
# rows, no marks sign-offs, no subject-targeted announcements; the datesheet
# row is a free-text label, not linked to the subject.
#
#   python scripts/split-senior-gk-1000-pictures.py            # dry run
#   python scripts/split-senior-gk-1000-pictures.py --apply
import io, json, re, sys, urllib.request, urllib.parse

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

ORG = '63cd5732-5db4-40e1-8fb9-60782bcfd059'
ORIG = 'ce1e0c0c-6e77-44f8-9290-46162ad1ae42'
YEAR = '2026-27'
NEW_ORIG_NAME = '1000 Picture Reading'
GK_NAME = 'G.K'
ORAL_10 = [{"label": "Oral", "marks": 10, "paper": "oral"}]
GK_PREFIX = re.compile(r'^G\.K(?:\s*\(oral\))?\s*:\s*', re.I)
PICS_PREFIX = re.compile(r'^1000 Pictures\s*:\s*', re.I)

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

orig = req('GET', f"class_subject?id=eq.{ORIG}&select=*")[0]
CLASS = orig['class_id']
assert req('GET', f"class?id=eq.{CLASS}&select=name")[0]['name'] == 'Senior'

# Guards: nothing may depend on the old /20 shape.
scores = req('GET', f"exam_subject_score?class_subject_id=eq.{ORIG}&select=id")
assert not scores, f"{len(scores)} marks already entered for this subject - stop, split by hand"

orig_ss = req('GET', f"section_subject?class_subject_id=eq.{ORIG}&archived_at=is.null&select=*")
orig_cur = req('GET', f"curriculum?class_subject_id=eq.{ORIG}&academic_year=eq.{q(YEAR)}&select=*")[0]
topics = req('GET', f"curriculum_topic?curriculum_id=eq.{orig_cur['id']}&select=id,name,display_order&order=display_order")
gk_topics = [t for t in topics if GK_PREFIX.match(t['name'])]
gk_ids = [t['id'] for t in gk_topics]
if gk_ids:
    tied = (req('GET', f"lesson?curriculum_topic_id=in.({','.join(gk_ids)})&select=id") or []) \
         + (req('GET', f"assignment?curriculum_topic_id=in.({','.join(gk_ids)})&select=id") or [])
    assert not tied, f"{len(tied)} lessons/assignments sit on G.K topics - move them with the topics first"

print(f"Senior / {orig['name']}: {len(orig_ss)} sections, {len(topics)} topics ({len(gk_topics)} G.K)")

# 1. The existing subject becomes "1000 Picture Reading", oral /10.
if orig['name'] != NEW_ORIG_NAME or orig['assessment_weights'] != ORAL_10:
    act(f"rename '{orig['name']}' -> '{NEW_ORIG_NAME}', weights -> oral /10",
        lambda: req('PATCH', f"class_subject?id=eq.{ORIG}", {'name': NEW_ORIG_NAME, 'assessment_weights': ORAL_10}, prefer='return=minimal'))
for ss in orig_ss:
    if ss['name'] != NEW_ORIG_NAME:
        act(f"rename section row {ss['id'][:8]} -> '{NEW_ORIG_NAME}'",
            lambda ss=ss: req('PATCH', f"section_subject?id=eq.{ss['id']}", {'name': NEW_ORIG_NAME}, prefer='return=minimal'))
if orig_cur['title'] != f"{NEW_ORIG_NAME} · {YEAR}":
    act("rename curriculum title",
        lambda: req('PATCH', f"curriculum?id=eq.{orig_cur['id']}", {'title': f"{NEW_ORIG_NAME} · {YEAR}"}, prefer='return=minimal'))

# 2. The G.K subject, placed right after it; later subjects shift down one.
gk = req('GET', f"class_subject?class_id=eq.{CLASS}&name=eq.{q(GK_NAME)}&archived_at=is.null&select=*")
gk = gk[0] if gk else None
gk_sort = orig['sort_order'] + 1
if not gk:
    later = req('GET', f"class_subject?class_id=eq.{CLASS}&archived_at=is.null&sort_order=gte.{gk_sort}&select=id,name,sort_order&order=sort_order.desc")
    for s in later:
        act(f"shift '{s['name']}' sort {s['sort_order']} -> {s['sort_order'] + 1}",
            lambda s=s: (req('PATCH', f"class_subject?id=eq.{s['id']}", {'sort_order': s['sort_order'] + 1}, prefer='return=minimal'),
                         req('PATCH', f"section_subject?class_subject_id=eq.{s['id']}", {'sort_order': s['sort_order'] + 1}, prefer='return=minimal')))
    gk = act(f"create class subject '{GK_NAME}' (sort {gk_sort}, oral /10)",
        lambda: req('POST', 'class_subject', {
            'org_id': ORG, 'class_id': CLASS, 'name': GK_NAME, 'sort_order': gk_sort,
            'created_by': orig['created_by'], 'assessment_weights': ORAL_10,
        }, prefer='return=representation')[0])

# 3. Per-section rows with the same teachers, and any subject-scoped grants.
for ss in orig_ss:
    have = req('GET', f"section_subject?class_subject_id=eq.{gk['id']}&class_section_id=eq.{ss['class_section_id']}&archived_at=is.null&select=id") if gk else []
    if have:
        continue
    new_ss = act(f"create G.K section row for section {ss['class_section_id'][:8]} (teacher {str(ss['teacher_user_id'])[:8]})",
        lambda ss=ss: req('POST', 'section_subject', {
            'org_id': ORG, 'class_section_id': ss['class_section_id'], 'class_subject_id': gk['id'],
            'name': GK_NAME, 'teacher_user_id': ss['teacher_user_id'], 'sort_order': gk_sort,
        }, prefer='return=representation')[0])
    for g in req('GET', f"user_roles?subject_id=eq.{ss['id']}&revoked_at=is.null&select=user_id,role_type,scope_type,scope_id") or []:
        act(f"copy grant {g['role_type']} for {g['user_id'][:8]}",
            lambda g=g, new_ss=new_ss: req('POST', 'user_roles', dict(g, subject_id=new_ss['id']), prefer='return=minimal'))

# 4. G.K curriculum, and its topics moved over (prefixes dropped - the
#    subject name now says what the prefix used to).
gk_cur = req('GET', f"curriculum?class_subject_id=eq.{gk['id']}&academic_year=eq.{q(YEAR)}&select=*") if gk else []
gk_cur = gk_cur[0] if gk_cur else act(f"create curriculum '{GK_NAME} · {YEAR}'",
    lambda: req('POST', 'curriculum', {
        'org_id': ORG, 'class_subject_id': gk['id'], 'academic_year': YEAR,
        'title': f"{GK_NAME} · {YEAR}", 'description': orig_cur.get('description'),
        'created_by': orig_cur['created_by'],
    }, prefer='return=representation')[0])
for i, t in enumerate(gk_topics):
    act(f"move topic '{t['name']}' -> G.K as '{GK_PREFIX.sub('', t['name'])}' (order {i})",
        lambda t=t, i=i: req('PATCH', f"curriculum_topic?id=eq.{t['id']}",
            {'curriculum_id': gk_cur['id'], 'name': GK_PREFIX.sub('', t['name']), 'display_order': i}, prefer='return=minimal'))
for i, t in enumerate([t for t in topics if t['id'] not in gk_ids]):
    new_name = PICS_PREFIX.sub('', t['name'])
    if new_name != t['name'] or t['display_order'] != i:
        act(f"keep topic '{t['name']}' as '{new_name}' (order {i})",
            lambda t=t, i=i, new_name=new_name: req('PATCH', f"curriculum_topic?id=eq.{t['id']}",
                {'name': new_name, 'display_order': i}, prefer='return=minimal'))

if not APPLY:
    print("\nDRY RUN - re-run with --apply")
    sys.exit(0)

# Verify.
subs = req('GET', f"class_subject?class_id=eq.{CLASS}&archived_at=is.null&select=name,sort_order,assessment_weights&order=sort_order")
print("\nSenior subjects now:")
for s in subs:
    print(f"  [{s['sort_order']}] {s['name']}  {json.dumps(s['assessment_weights'], ensure_ascii=False)}")
for cid, label in ((orig_cur['id'], NEW_ORIG_NAME), (gk_cur['id'], GK_NAME)):
    n = len(req('GET', f"curriculum_topic?curriculum_id=eq.{cid}&select=id"))
    print(f"  {label}: {n} topics")
