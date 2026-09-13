# -*- coding: utf-8 -*-
# Sync per-student monthly fees from the school's fee registers
# (fees/*.xls, Muneeb 13 Sep 2026) - one row per student, GRN + Monthly
# Fee. The registers are the school's authoritative figures, so where a
# student's effective amount differs it is UPDATED (and each change is
# printed); students not present in a file are left untouched.
#
# Mapping onto the fee model:
#   - class_fee_plan "Monthly Tuition" already exists per class - the
#     class default. Plans are never changed here.
#   - a student whose register fee equals the class default needs no
#     override (an existing override is REMOVED so they follow the plan);
#   - a differing fee becomes a student_fee_override.override_amount;
#   - a fee of 0 becomes waived=true.
#
#   python scripts/apply-fee-registers.py fees            # dry run
#   python scripts/apply-fee-registers.py fees --apply
import io, json, glob, os, re, sys, urllib.request

sys.stdout.reconfigure(encoding='utf-8')
APPLY = "--apply" in sys.argv
DIR = next((a for a in sys.argv[1:] if not a.startswith("--")), "fees")

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

# ── read the registers ────────────────────────────────────────────────
import xlrd
sheet_rows = []   # (file, gr, name, fee)
for f in sorted(glob.glob(os.path.join(DIR, '*.xls'))):
    wb = xlrd.open_workbook(f)
    sh = wb.sheet_by_index(0)
    hdr = hrow = None
    for r in range(min(15, sh.nrows)):
        vals = [str(sh.cell_value(r, c)).strip() for c in range(sh.ncols)]
        if 'GRN' in vals:
            hdr = {v: i for i, v in enumerate(vals) if v}
            hrow = r
            break
    assert hdr, f"{f}: no GRN header"
    gi, ni = hdr['GRN'], hdr['Name']
    fi = hdr.get('Monthly Fee')
    for r in range(hrow + 1, sh.nrows):
        row = [sh.cell_value(r, c) for c in range(sh.ncols)]
        gr = row[gi]
        if str(gr).strip() == '': continue
        gr = str(int(gr)) if isinstance(gr, float) else str(gr).strip()
        if fi is not None:
            fee = row[fi]
        else:
            # Class X's export lost the header cell; the amount is the
            # rightmost numeric cell on the row.
            nums = [v for v in row if isinstance(v, float)]
            fee = nums[-1] if nums else ''
        if not isinstance(fee, float):
            print(f"! {os.path.basename(f)} GR {gr}: no fee on the row - skipped")
            continue
        sheet_rows.append((os.path.basename(f), gr, str(row[ni]).strip(), int(fee)))
print(f"register rows: {len(sheet_rows)}")

# ── current state ─────────────────────────────────────────────────────
students = req('GET', f"student?org_id=eq.{ORG}&select=id,full_name,gr_number,status,class_section_id")
by_gr = {}
for s in students:
    by_gr.setdefault(str(s['gr_number']), []).append(s)
secs = {s['id']: s for s in req('GET', "class_section?select=id,class_id")}
plans = req('GET', f"class_fee_plan?org_id=eq.{ORG}&archived_at=is.null"
                   f"&name=eq.Monthly%20Tuition&select=id,class_id,amount")
plan_by_class = {p['class_id']: p for p in plans}
ovr = req('GET', "student_fee_override?select=id,student_id,class_fee_plan_id,override_amount,waived")
ovr_by = {(o['student_id'], o['class_fee_plan_id']): o for o in ovr}

set_ovr = clr_ovr = waived_n = same = 0
flags = []
for fname, gr, name, fee in sheet_rows:
    cands = by_gr.get(gr, [])
    if not cands:
        flags.append(f"{fname} GR {gr} {name}: student not found"); continue
    stu = cands[0]
    if stu['status'] != 'active':
        flags.append(f"{fname} GR {gr} {name}: student is {stu['status']} - skipped"); continue
    class_id = secs.get(stu['class_section_id'], {}).get('class_id')
    plan = plan_by_class.get(class_id)
    if not plan:
        flags.append(f"{fname} GR {gr} {name}: no Monthly Tuition plan for their class"); continue
    key = (stu['id'], plan['id'])
    cur = ovr_by.get(key)
    cur_amount = 0 if (cur and cur['waived']) else \
        (float(cur['override_amount']) if cur and cur['override_amount'] is not None
         else float(plan['amount']))
    if int(cur_amount) == fee:
        same += 1; continue
    if fee == int(float(plan['amount'])):
        # matches the class default again - drop the override.
        print(f"   ~ {name} (GR {gr}): {int(cur_amount)} -> plan default {fee} (override removed)")
        clr_ovr += 1
        if APPLY and cur:
            req('DELETE', f"student_fee_override?id=eq.{cur['id']}")
        continue
    body = {'org_id': ORG, 'student_id': stu['id'], 'class_fee_plan_id': plan['id'],
            'override_amount': None if fee == 0 else fee, 'waived': fee == 0}
    label = 'WAIVED' if fee == 0 else fee
    print(f"   + {name} (GR {gr}): {int(cur_amount)} -> {label}")
    set_ovr += 1
    if fee == 0: waived_n += 1
    if APPLY:
        if cur:
            req('PATCH', f"student_fee_override?id=eq.{cur['id']}",
                {'override_amount': body['override_amount'], 'waived': body['waived']})
        else:
            req('POST', 'student_fee_override', body, prefer='return=minimal')

print(f"\n{'APPLIED' if APPLY else 'DRY RUN'}")
print(f"  already correct      : {same}")
print(f"  overrides set/updated: {set_ovr}  (of which waived: {waived_n})")
print(f"  overrides removed    : {clr_ovr}  (back to class default)")
print(f"\nflags ({len(flags)}):")
for f in flags: print("  !", f)
