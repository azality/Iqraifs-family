# -*- coding: utf-8 -*-
# Apply Ambreen's Sheet 1 answers (10 Sep 2026). She grouped children by
# family and gave one contact number per family. Rows she left without a
# "Family" label are separate families that merely share a name.
#
#   --apply  actually write; default is a dry run.
import io, json, sys, urllib.request, collections, re

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

def req(method, path, body=None):
    r = urllib.request.Request(URL + '/rest/v1/' + path, method=method,
        data=json.dumps(body).encode() if body is not None else None, headers=H)
    with urllib.request.urlopen(r) as resp:
        t = resp.read().decode()
        return json.loads(t) if t.strip() else None

def rest_all(base):
    out, off = [], 0
    while True:
        b = req('GET', base + f'&limit=1000&offset={off}')
        out += b
        if len(b) < 1000: break
        off += 1000
    return out

def norm_phone(v):
    d = re.sub(r'\D', '', str(v).split('.')[0])
    if not d: return None
    if not d.startswith('0'): d = '0' + d
    return d

# Ambreen's answers: (label, father-name-on-record, phone, [GR numbers])
# The name matters: a child can also have a MOTHER row (Fatima Zehra has
# Gulbano). Only rows carrying the father's name may be merged together —
# a differently-named parent is a different person, never an alias.
FAMILIES = [
    ("Amjad Allawddin",   "amjad allawddin",   "03190333129", ["2319", "2321", "2320"]),
    ("Muhammad Adnan A",  "muhammad adnan",    "03111251259", ["1657", "2339"]),
    ("Muhammad Adnan B",  "muhammad adnan",    "3238237527",  ["2464", "2263"]),
    ("Muhammad Adnan C",  "muhammad adnan",    "3118944114",  ["2280"]),
    ("Muhammad Imran 1",  "muhammad imran",    "3432901254",  ["1701"]),
    ("Muhammad Imran 2",  "muhammad imran",    "03151099955", ["2479"]),
    ("Muhammad Imran 3",  "muhammad imran",    "3160124984",  ["1945"]),
    ("Muhammad Imran 4",  "muhammad imran",    "3281683358",  ["2091"]),
    ("Muhammad Imran 5",  "muhammad imran",    "3047864610",  ["2345"]),
    ("Muhammad Muzaffar", "muhammad muzaffar", "03363488938", ["2295", "2298", "2430", "2377", "2296", "2297"]),
    ("Muhammad Nazeer",   "muhammad nazeer",   "03171093653", ["2443", "2256"]),
    ("Muhammad Tariq",    "muhammad tariq",    "3002734416",  ["1996", "1997", "1432"]),
]

def nn(s): return re.sub(r'\s+', ' ', (s or '').strip().lower())

parents = rest_all(f'parent?org_id=eq.{ORG}&select=id,full_name,phone,relationship,canonical_id,created_at')
links = rest_all(f'student_parent?select=student_id,parent_id,parent!inner(org_id)&parent.org_id=eq.{ORG}')
students = rest_all(f'student?org_id=eq.{ORG}&select=id,full_name,gr_number,guardian_phone')
creds = rest_all(f'pin_credential?org_id=eq.{ORG}&subject_type=eq.parent&select=subject_id')

pmap = {p['id']: p for p in parents}
by_gr = {}
for s in students:
    if s.get('gr_number'): by_gr[str(s['gr_number']).strip()] = s
parents_of = collections.defaultdict(list)
for l in links:
    parents_of[l['student_id']].append(l['parent_id'])
has_cred = {c['subject_id'] for c in creds}

merge_ops, phone_ops, card_ops, problems, others, conflicts = [], [], [], [], [], []
touched_parent_ids = set()

for label, fname, raw_phone, grs in FAMILIES:
    phone = norm_phone(raw_phone)
    kids = []
    for gr in grs:
        s = by_gr.get(gr)
        if not s:
            problems.append(f"{label}: GR {gr} not found")
            continue
        kids.append(s)
    # Parent rows on these children that carry the FATHER'S NAME. Other
    # parents (mothers, guardians) are left completely alone.
    prow_ids = []
    for s in kids:
        for pid in parents_of[s['id']]:
            p = pmap.get(pid)
            if not p or p.get('canonical_id') or pid in prow_ids:
                continue
            if nn(p['full_name']) != fname:
                others.append(f"{label}: left alone -> {p['full_name']} "
                              f"[{p.get('relationship')}] {p.get('phone') or '-'}")
                continue
            prow_ids.append(pid)
    if not prow_ids:
        problems.append(f"{label}: no parent rows on those children")
        continue
    # root: has a PIN > phone already matches > oldest
    prow_ids.sort(key=lambda pid: (
        pid not in has_cred,
        norm_phone(pmap[pid].get('phone') or '') != phone,
        pmap[pid]['created_at'],
    ))
    root, aliases = prow_ids[0], prow_ids[1:]
    touched_parent_ids.update(prow_ids)
    for a in aliases:
        merge_ops.append((label, a, root))
    cur_root_phone = norm_phone(pmap[root].get('phone') or '')
    if cur_root_phone != phone:
        if cur_root_phone:
            # The father row already carries a number and Ambreen marked
            # most of these as the MOTHER's - never destroy the father's
            # own number on her note. The child's contact card still gets
            # her number below; this conflict is reported for a human.
            conflicts.append(f"{label}: {pmap[root]['full_name']} keeps "
                             f"{pmap[root]['phone']}, school gave {phone}")
        else:
            phone_ops.append((label, root, pmap[root]['phone'], phone))
    for s in kids:
        if norm_phone(s.get('guardian_phone') or '') != phone:
            card_ops.append((label, s['id'], s['full_name'], s.get('guardian_phone'), phone))

print(("APPLY" if APPLY else "DRY RUN") +
      f" — merges {len(merge_ops)} | parent phones {len(phone_ops)} | student cards {len(card_ops)}")
print("\n== merges (alias -> root) ==")
for label, a, root in merge_ops:
    print(f"  {label}: {pmap[a]['full_name']} ({pmap[a]['phone'] or '-'}) -> keep {pmap[root]['full_name']}")
print("\n== parent phone set/changed ==")
for label, pid, old, new in phone_ops:
    flag = "  <-- OVERWRITES" if old and norm_phone(old) != new else ""
    print(f"  {label}: {pmap[pid]['full_name']}  {old or '(none)'} -> {new}{flag}")
print("\n== student contact cards ==")
for label, sid, name, old, new in card_ops:
    flag = "  <-- OVERWRITES" if old and norm_phone(old) != new else ""
    print(f"  {label}: {name}  {old or '(none)'} -> {new}{flag}")
if problems:
    print("\n== PROBLEMS ==")
    for p in problems: print("  ", p)

if APPLY:
    for label, a, root in merge_ops:
        req('PATCH', f"parent?id=eq.{a}", {'canonical_id': root})
    for label, pid, old, new in phone_ops:
        req('PATCH', f"parent?id=eq.{pid}", {'phone': new})
    for label, sid, name, old, new in card_ops:
        req('PATCH', f"student?id=eq.{sid}", {'guardian_phone': new})
    print("\napplied.")
    io.open('ambreen-applied-parents.json', 'w', encoding='utf-8').write(
        json.dumps(sorted(touched_parent_ids)))
