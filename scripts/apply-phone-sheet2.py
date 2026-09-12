# -*- coding: utf-8 -*-
# Apply the school's filled "Missing phone numbers" sheet (Ambreen,
# 12 Sep 2026) - the Sheet 2 that unblocks the parent/student portal.
#
# Rules (learned the hard way on Sheet 1, see memory):
#   - NEVER overwrite a phone that is already set; differences are
#     reported, not resolved by the script.
#   - The sheet's Notes say WHOSE number it is. "Father" -> the father's
#     own `phone` (his parent-portal login identifier). Anything else
#     (Mother, Aunt...) -> the father's `home_phone` - the household
#     number the school calls - because we have no mother record and
#     fabricating one without a name would be worse data.
#   - student.guardian_phone is denormalized and is what the student
#     card, PIN identifier and school calls use: it gets the number in
#     every case (when empty).
#   - Dedupe org-wide, NAME-GATED: two live records with the same
#     normalized name that end up carrying the same number are the same
#     person -> canonical-merge (children follow, nothing deleted).
#     Same number under DIFFERENT names is only ever reported.
#
#   python scripts/apply-phone-sheet2.py <xlsx-path>            # dry run
#   python scripts/apply-phone-sheet2.py <xlsx-path> --apply
import io, json, re, sys, urllib.request, urllib.parse
from collections import defaultdict

sys.stdout.reconfigure(encoding='utf-8')
APPLY = "--apply" in sys.argv
XLSX = next((a for a in sys.argv[1:] if not a.startswith("--")), None)
assert XLSX, "usage: apply-phone-sheet2.py <xlsx> [--apply]"

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

def norm_name(s):
    return re.sub(r'\s+', ' ', re.sub(r'[.\-]', ' ', (s or '').strip().lower()))

def norm_phone(v):
    if v is None: return None
    if isinstance(v, float) and v.is_integer(): v = int(v)
    d = re.sub(r'\D', '', str(v))
    # Excel strips the leading zero of 03xx numbers.
    if len(d) == 10 and d.startswith('3'): d = '0' + d
    if re.fullmatch(r'03\d{9}', d): return d
    return ('BAD:' + d) if d else None

# ── 1. Read the sheet ─────────────────────────────────────────────────
import openpyxl
wb = openpyxl.load_workbook(XLSX, data_only=True)
ws = wb['Missing phone numbers']
rows = []
for r in ws.iter_rows(min_row=6, values_only=True):
    cls, gr, student, father, phone, notes = [
        (str(x).strip() if x is not None else '') for x in (list(r[:6]) + [''] * 6)[:6]]
    if not gr or gr == '(example) Class I A':
        continue
    rows.append({'cls': cls, 'gr': gr, 'student': student, 'father': father,
                 'phone': norm_phone(r[4]), 'notes': notes})
print(f"sheet rows: {len(rows)}")

# ── 2. Current state ─────────────────────────────────────────────────
students = req('GET', f"student?org_id=eq.{ORG}&select=id,full_name,gr_number,guardian_phone,status")
by_gr = {}
for s in students:
    by_gr.setdefault(str(s['gr_number']), []).append(s)
parents = req('GET', f"parent?org_id=eq.{ORG}"
                     f"&select=id,full_name,phone,home_phone,cell_phone,canonical_id")
live = [p for p in parents if not p.get('canonical_id')]
links = req('GET', "student_parent?select=student_id,parent_id")
parents_of = defaultdict(list)
pby = {p['id']: p for p in parents}
for l in links:
    parents_of[l['student_id']].append(l['parent_id'])

def resolve(pid):
    p = pby.get(pid)
    while p and p.get('canonical_id'):
        p = pby.get(p['canonical_id'])
    return p

flags, gset, pset, hset = [], 0, 0, 0
touched = {}   # live parent id -> the number this sheet put on it

# ── 3. Fill ───────────────────────────────────────────────────────────
for row in rows:
    tag = f"GR {row['gr']} {row['student']}"
    if row['phone'] is None:
        flags.append(f"{tag}: no phone on the row"); continue
    if row['phone'].startswith('BAD:'):
        flags.append(f"{tag}: phone does not look like 03xxxxxxxxx -> {row['phone'][4:]}"); continue
    cands = by_gr.get(row['gr'], [])
    if not cands:
        flags.append(f"{tag}: student not found"); continue
    stu = cands[0]
    if norm_name(stu['full_name']) != norm_name(row['student']):
        flags.append(f"{tag}: name on record is '{stu['full_name']}' (kept going)")

    # guardian_phone - the number the school calls.
    if not stu.get('guardian_phone'):
        gset += 1
        if APPLY:
            req('PATCH', f"student?id=eq.{stu['id']}", {'guardian_phone': row['phone']})
        stu['guardian_phone'] = row['phone']
    elif stu['guardian_phone'] != row['phone']:
        flags.append(f"{tag}: guardian_phone already {stu['guardian_phone']}, sheet says {row['phone']} - left as is")

    # the father's card.
    fam = [resolve(pid) for pid in parents_of.get(stu['id'], [])]
    fam = [p for p in fam if p]
    father = next((p for p in fam if norm_name(p['full_name']) == norm_name(row['father'])), None)
    if not father:
        flags.append(f"{tag}: father '{row['father']}' not linked to the student - phone kept on guardian_phone only")
        continue
    owner_is_father = norm_name(row['notes']).startswith('father')
    field = 'phone' if owner_is_father else 'home_phone'
    if not father.get(field):
        (pset if owner_is_father else hset) and None
        if owner_is_father: pset += 1
        else: hset += 1
        if APPLY:
            req('PATCH', f"parent?id=eq.{father['id']}", {field: row['phone']})
        father[field] = row['phone']
        touched[father['id']] = row['phone']
    elif father[field] != row['phone']:
        flags.append(f"{tag}: {row['father']}.{field} already {father[field]}, sheet says {row['phone']} - left as is")
    else:
        touched.setdefault(father['id'], row['phone'])

# ── 4. Dedupe: same NAME + same number -> one person ─────────────────
# Only records this sheet touched can newly collide. Merge is
# canonical-alias (reversible), children follow automatically through
# resolve(); nothing is deleted and no phone is overwritten.
def numbers(p):
    return {p.get(k) for k in ('phone', 'home_phone', 'cell_phone') if p.get(k)}

merges, name_clashes = [], []
for pid, num in touched.items():
    me = pby[pid]
    for other in live:
        if other['id'] == pid or other.get('canonical_id'): continue
        if num not in numbers(other): continue
        if norm_name(other['full_name']) == norm_name(me['full_name']):
            a, b = sorted([me, other], key=lambda p: p['id'])
            if (a['id'], b['id']) not in [(x['id'], y['id']) for x, y in merges]:
                merges.append((a, b))
        else:
            name_clashes.append(
                f"{me['full_name']} and {other['full_name']} now share {num} - DIFFERENT names, not merged")

done_merges = 0
for keep, dup in merges:
    # keep the record with more linked children (ties: the first).
    kids = lambda p: sum(1 for pids in parents_of.values() if p['id'] in pids)
    if kids(dup) > kids(keep): keep, dup = dup, keep
    if dup.get('canonical_id'): continue
    print(f"   merge: {dup['full_name']} ({dup['id'][:8]}) -> {keep['full_name']} ({keep['id'][:8]})")
    done_merges += 1
    if APPLY:
        req('PATCH', f"parent?id=eq.{dup['id']}", {'canonical_id': keep['id']})
        dup['canonical_id'] = keep['id']

print(f"\n{'APPLIED' if APPLY else 'DRY RUN'}")
print(f"  guardian_phone set : {gset}")
print(f"  father phone set   : {pset}   (his own number - portal login works)")
print(f"  home_phone set     : {hset}   (mother's/household number, on the father's card)")
print(f"  same-name merges   : {done_merges}")
print(f"\nflags ({len(flags)}):")
for f in flags: print("  !", f)
print(f"\nname clashes ({len(set(name_clashes))}):")
for f in sorted(set(name_clashes)): print("  ?", f)
