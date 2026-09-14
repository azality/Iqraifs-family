# -*- coding: utf-8 -*-
# Catch Up fathers from the school's contact sheet (fees/CatchUp.xls,
# Muneeb 14 Sep 2026) - the missing records behind "parent PINs were
# generated only for a very few" (10 Sep): 7 of 10 Catch Up children
# had no father on record.
#
# The sheet's numbers were checked against the org first:
#   - No duplicates inside the sheet (GRs, fathers, phones all distinct).
#   - Org-wide dedupe by NAME+PHONE (the 100-dup-fathers lesson): two
#     fathers already exist with the sheet's exact phone and are only
#     LINKED here - Yasir (Muhammad Hamdan Yasir's father, GR 2453) to
#     Muhammad Yousha Yasir, and Syed Tawakkul Hussain (Syeda Rameen's
#     father) to Syed Taimoor Hussain. This also settles the two
#     name-match questions we had open with the school.
#   - Five "Muhammad Adnan" parents exist, NONE with Ayaan's sheet
#     phone - a namesake is never reused without the phone agreeing, so
#     Ayaan gets his own father row.
#   - GR 2467 (Faraz), 2470 (Abdul Rahman), 2475 (Umar Muavia) already
#     have full families on record - untouched.
#   - Monthly fees in the sheet already match the live overrides row for
#     row (incl. Faraz at 0) - fees are NOT touched here.
#
# Left for the school (printed as flags, not applied):
#   - GR 2475 Umar Muavia: sheet contact 0305-3727112 differs from the
#     recorded Saddam Hussain 0301-2163363 - which is current?
#   - GR 2470: sheet spells "Abdur Rahman", records say "Abdul Rahman".
#
# guardian_phone is denormalized (memory rule): every new father's phone
# is also written to student.guardian_phone where it differs.
#
#   python scripts/apply-catchup-parents.py            # dry run
#   python scripts/apply-catchup-parents.py --apply
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

def act(msg, fn):
    print(("  APPLY " if APPLY else "  would ") + msg)
    return fn() if APPLY else None

# (gr, father name as recorded, phone) - phone in the org's 0xxxxxxxxxx form.
FATHERS = [
    ("2404", "Muhammad Adnan",        "03121159336"),
    ("2405", "Syed Muhammad Intikhab","03152035984"),
    ("2413", "Muhammad Israr",        "03342178198"),
    ("2251", "Muhammad Anwar",        "03323972737"),
    ("2455", "Yasir",                 "03272544331"),
    ("2456", "Syed Tawakkul Hussain", "03212338090"),  # sheet: "Tawakkal"; org spelling kept
    ("1626", "Syed Imran Ali",        "03122026757"),
]

grs = ",".join(g for g, _, _ in FATHERS)
stus = req('GET', f"student?org_id=eq.{ORG}&gr_number=in.({grs})&select=id,full_name,gr_number,guardian_phone")
by_gr = {s['gr_number']: s for s in stus}
assert len(by_gr) == len(FATHERS), f"expected {len(FATHERS)} students, found {len(by_gr)}"

linked_n = created_n = phones_n = 0
for gr, name, phone in FATHERS:
    stu = by_gr[gr]
    # Reuse by name+phone (org-wide); otherwise create.
    hits = req('GET', f"parent?org_id=eq.{ORG}&full_name=ilike.{q(name)}&phone=eq.{q(phone)}&select=id,full_name")
    if hits:
        parent = hits[0]
        print(f"  = {stu['full_name']} (GR {gr}): father {parent['full_name']!r} already on record - reusing")
    else:
        parent = act(f"create father {name!r} {phone} for {stu['full_name']} (GR {gr})",
            lambda name=name, phone=phone: req('POST', 'parent', {
                'org_id': ORG, 'full_name': name, 'title': 'Mr.', 'relationship': 'father',
                'phone': phone, 'cell_phone': phone,
            }, prefer='return=representation')[0])
        created_n += 1
    if parent is None:  # dry run create
        print(f"    would link + set guardian_phone as below")
    have = parent and req('GET', f"student_parent?student_id=eq.{stu['id']}&parent_id=eq.{parent['id']}&select=student_id")
    if parent and have:
        print(f"    already linked")
    else:
        # Same shape as the admission loader's father links.
        act(f"link {name!r} -> {stu['full_name']} (father, primary, fee payer)",
            lambda parent=parent, stu=stu, phone=phone: req('POST', 'student_parent', {
                'student_id': stu['id'], 'parent_id': parent['id'], 'parent_role': 'father',
                'is_primary': True, 'is_primary_contact': True, 'is_fee_payer': True,
                'is_emergency_contact': False, 'is_pickup_authorized': True,
                'portal_access_phone': phone,
            }, prefer='return=minimal'))
        linked_n += 1
    if stu['guardian_phone'] != phone:
        act(f"guardian_phone {stu['guardian_phone']} -> {phone} ({stu['full_name']})",
            lambda stu=stu, phone=phone: req('PATCH', f"student?id=eq.{stu['id']}",
                {'guardian_phone': phone}, prefer='return=minimal'))
        phones_n += 1

print(f"\n{'APPLIED' if APPLY else 'DRY RUN'}: fathers created {created_n}, links added {linked_n}, guardian phones updated {phones_n}")
print("""
flags for the school (nothing changed for these):
  ! GR 2475 Umar Muavia: sheet contact 0305-3727112, records have Saddam
    Hussain at 0301-2163363 - which number is current?
  ! GR 2470: sheet says "Abdur Rahman", records say "Abdul Rahman" -
    confirm the spelling before we rename anything.""")

if APPLY:
    # Verify: every Catch Up child now has at least one linked parent.
    sec = req('GET', f"class?org_id=eq.{ORG}&name=eq.Catch%20Up&select=id")[0]
    kids = req('GET', f"student?org_id=eq.{ORG}&status=eq.active&select=id,full_name,gr_number,class_section:class_section_id!inner(class_id)&class_section.class_id=eq.{sec['id']}")
    print("\nCatch Up parent coverage now:")
    for k in kids:
        links = req('GET', f"student_parent?student_id=eq.{k['id']}&select=parent:parent_id(full_name,phone)")
        names = ", ".join(f"{l['parent']['full_name']} ({l['parent']['phone']})" for l in links) or "NONE"
        print(f"  GR {k['gr_number']} {k['full_name']}: {names}")
