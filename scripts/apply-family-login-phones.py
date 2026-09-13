# -*- coding: utf-8 -*-
# Option 2 (Muneeb, 12 Sep): families whose only number is the mother's/
# household one still get a parent-portal login - the household number
# becomes the record's login phone. Whoever holds that phone (usually
# the mother) logs into the family's account.
#
# Care taken:
#   - Only parents with NO phone move; a set phone is never touched.
#   - The PIN login identifier must be unique (pin_credential's
#     login_identifier is looked up with maybeSingle), so each number is
#     given to exactly ONE parent record - the one with the most linked
#     children (tie: oldest record). Brothers sharing a household line
#     are reported: the family logs in through the holder's record.
#   - A number already in use as some parent's phone (or as an existing
#     login identifier) is never handed out again.
#
#   python scripts/apply-family-login-phones.py            # dry run
#   python scripts/apply-family-login-phones.py --apply
import io, json, sys, urllib.request
from collections import defaultdict

sys.stdout.reconfigure(encoding='utf-8')
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

parents = req('GET', f"parent?org_id=eq.{ORG}&canonical_id=is.null"
                     f"&select=id,full_name,phone,home_phone,created_at")
links = req('GET', "student_parent?select=student_id,parent_id")
kids = defaultdict(int)
for l in links:
    kids[l['parent_id']] += 1
creds = req('GET', f"pin_credential?org_id=eq.{ORG}&select=login_identifier") or []

taken = {p['phone'] for p in parents if p['phone']}
taken |= {c['login_identifier'] for c in creds if c.get('login_identifier')}

by_number = defaultdict(list)
for p in parents:
    if not p['phone'] and p.get('home_phone'):
        by_number[p['home_phone']].append(p)

flips, shared, blocked = 0, [], []
for number, cands in sorted(by_number.items()):
    if number in taken:
        for p in cands:
            blocked.append(f"{p['full_name']}: {number} is already someone's login - left without one")
        continue
    holder = sorted(cands, key=lambda p: (-kids[p['id']], p['created_at']))[0]
    print(f"   {holder['full_name']:<28} phone <- {number}"
          + (f"   (kids {kids[holder['id']]})" if len(cands) > 1 else ""))
    flips += 1
    if APPLY:
        req('PATCH', f"parent?id=eq.{holder['id']}", {'phone': number})
    taken.add(number)
    for p in cands:
        if p['id'] != holder['id']:
            shared.append(f"{p['full_name']} shares {number} - family logs in through {holder['full_name']}")

print(f"\n{'APPLIED' if APPLY else 'DRY RUN'} - {flips} login phones set")
print(f"\nshared-household notes ({len(shared)}):")
for s in shared: print("  ~", s)
print(f"\nblocked ({len(blocked)}):")
for b in blocked: print("  !", b)
