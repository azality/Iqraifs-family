# -*- coding: utf-8 -*-
# The Catch Up class's 1st Assessment datesheet (diary page photographed
# by Muneeb, 11 Sep 2026). Catch Up was the ONLY class with no published
# datesheet - every other class was loaded on 4 Sep.
#
# The second photo (11 Sep) shows the page ends at Urdu (Guardian's
# Signature follows), so these four papers ARE the whole datesheet -
# Catch Up sits only Quran, Maths, English and Urdu, and only three of
# its ten students take them now: GR 2404 Muhammad Ayaan Adnan, GR 2251
# Muhammad Ikrash, GR 2405 Syed Muhammad Aaliyan (Ambreen: "jinke abhi
# assessment hongy"). The datesheet is per class, so that lives here as
# a note for whoever reads the marks sheet.
#
# Times are not on the page; they follow the school's own pattern for
# every other class (08:00, ending 12:15 - the 11:30 finish is used only
# for the short papers, which we were not told about here).
#
#   python scripts/seed-catchup-datesheet.py            # dry run
#   python scripts/seed-catchup-datesheet.py --apply
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

CLASS = "Catch Up"
# (date, the school's own label, the subject it maps to)
# "New catch-up time table" (Muneeb, 11 Sep): Quran moved from Friday
# 11 Sep to Monday 14 Sep, sitting WITH the Maths written.
PAPERS = [
    ("2026-09-14", "Quran",   "Quran"),
    ("2026-09-14", "Maths",   "Maths"),
    ("2026-09-16", "English", "English"),
    ("2026-09-19", "Urdu",    "Urdu"),
]

cls = req('GET', f"class?org_id=eq.{ORG}&name=eq.{q(CLASS)}&select=id")[0]
term = req('GET', f"academic_term?org_id=eq.{ORG}&is_current=is.true"
                  f"&archived_at=is.null&select=id,name,start_date,end_date")[0]
subs = {s['name']: s['id'] for s in req(
    'GET', f"class_subject?class_id=eq.{cls['id']}&archived_at=is.null&select=id,name")}
have = {r['subject_label']: r for r in req(
    'GET', f"exam_schedule?class_id=eq.{cls['id']}&term_id=eq.{term['id']}"
           f"&select=id,exam_date,subject_label") or []}

print(f"{CLASS} -> term \"{term['name']}\" ({term['start_date']} .. {term['end_date']})")
added = moved = same = 0
for date, label, subject in PAPERS:
    if not (term['start_date'] <= date <= term['end_date']):
        print(f"!! {date} {label} falls outside the term - skipped"); continue
    if subject not in subs:
        print(f"!! subject not found: {subject}"); continue
    ex = have.get(label)
    if ex and ex['exam_date'] == date:
        same += 1
        continue
    if ex:
        # The school re-dated this paper - move it rather than duplicate.
        print(f"   ~ {label}: {ex['exam_date']} -> {date}")
        moved += 1
        if APPLY:
            req('PATCH', f"exam_schedule?id=eq.{ex['id']}", {'exam_date': date})
        continue
    print(f"   + {date}  {label}")
    if APPLY:
        req('POST', 'exam_schedule', {
            'org_id': ORG, 'term_id': term['id'], 'class_id': cls['id'],
            'class_subject_id': subs[subject], 'subject_label': label,
            'exam_date': date, 'start_time': '08:00:00', 'end_time': '12:15:00',
        }, prefer='return=minimal')
    added += 1

print(f"\n{'APPLIED' if APPLY else 'DRY RUN'} - {added} added, {moved} re-dated, "
      f"{same} already correct")
