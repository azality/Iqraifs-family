# -*- coding: utf-8 -*-
# Junior "Maths Activity" removed at the school's request (Ambreen, 13 Sep
# 2026: "Junior me ye maths activity wala subject delete krna hoga").
#
# Mirrors the app's own DELETE /school/class-subjects/:id (schoolSubjects.tsx):
# archive the class subject and its per-section rows, revoke subject-scoped
# grants. That endpoint leaves timetable entries alone, and the timetable
# reads don't filter archived subjects - so the one Junior A slot would keep
# showing "Maths Activity" (and in the teacher's day). That entry is removed
# too; its row is recorded below so it can be restored.
#
# Nothing else referenced the subject: no curriculum, lessons, assignments,
# and it was never examined (assessment_weights = []).
#
#   python scripts/archive-junior-maths-activity.py            # dry run
#   python scripts/archive-junior-maths-activity.py --apply
import io, json, sys, urllib.request
from datetime import datetime, timezone

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

CLASS_SUBJECT = 'a2929a0b-c567-487f-9704-18449314a3da'   # Junior / Maths Activity
TIMETABLE_ENTRY = '42e0b885-f5dd-4512-af3c-f16ae66bbdda'  # Junior A slot
# Restore record for the timetable entry (as found, 13 Sep 2026):
#   id 42e0b885-f5dd-4512-af3c-f16ae66bbdda, slot_id 1d3fbe7b-c781-4fa6-8d6c-fab3f01b6f36,
#   scope_section_id 0476760a-25a7-462c-9e84-c424717549f7 (Junior A),
#   section_subject_id 00a127cf-963b-4194-91b6-7d332a94e465,
#   teacher_user_id 4a104ab6-1770-4c4e-b229-d7b79d28e726, room null, notes null

def req(method, path, body=None, prefer=None):
    h = dict(H)
    if prefer: h['Prefer'] = prefer
    r = urllib.request.Request(URL + '/rest/v1/' + path, method=method,
        data=json.dumps(body).encode() if body is not None else None, headers=h)
    with urllib.request.urlopen(r) as resp:
        t = resp.read().decode()
        return json.loads(t) if t.strip() else None

now = datetime.now(timezone.utc).isoformat()

cs = req('GET', f"class_subject?id=eq.{CLASS_SUBJECT}&select=id,name,archived_at,class:class_id(name)")
assert cs and cs[0]['name'] == 'Maths Activity' and cs[0]['class']['name'] == 'Junior', cs
print(f"class subject: {cs[0]['class']['name']} / {cs[0]['name']}  archived_at={cs[0]['archived_at']}")

ss = req('GET', f"section_subject?class_subject_id=eq.{CLASS_SUBJECT}&select=id,archived_at,section:class_section_id(name)")
ss_ids = [r['id'] for r in ss]
print("section rows:", [(r['section']['name'], r['archived_at']) for r in ss])

grants = req('GET', f"user_roles?subject_id=in.({','.join(ss_ids)})&revoked_at=is.null&select=id,user_id,role_type") if ss_ids else []
print("active subject-scoped grants:", len(grants))

te = req('GET', f"timetable_entry?id=eq.{TIMETABLE_ENTRY}&select=id,section_subject_id")
print("timetable entry present:", bool(te))

if not APPLY:
    print("\nDRY RUN - re-run with --apply")
    sys.exit(0)

if cs[0]['archived_at'] is None:
    req('PATCH', f"class_subject?id=eq.{CLASS_SUBJECT}", {'archived_at': now}, prefer='return=minimal')
req('PATCH', f"section_subject?class_subject_id=eq.{CLASS_SUBJECT}&archived_at=is.null", {'archived_at': now}, prefer='return=minimal')
if grants:
    req('PATCH', f"user_roles?subject_id=in.({','.join(ss_ids)})&revoked_at=is.null", {'revoked_at': now}, prefer='return=minimal')
if te:
    assert te[0]['section_subject_id'] in ss_ids, te
    req('DELETE', f"timetable_entry?id=eq.{TIMETABLE_ENTRY}")

after = req('GET', f"class_subject?id=eq.{CLASS_SUBJECT}&select=archived_at")[0]
left = req('GET', f"section_subject?class_subject_id=eq.{CLASS_SUBJECT}&archived_at=is.null&select=id")
te_left = req('GET', f"timetable_entry?section_subject_id=in.({','.join(ss_ids)})&select=id")
print(f"\nAPPLIED - class subject archived_at={after['archived_at']}, live section rows={len(left)}, timetable entries left={len(te_left)}")
