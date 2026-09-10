# -*- coding: utf-8 -*-
# Junior English - split the one "Formation rhymes" topic into 26, one per
# letter. Ambreen (10 Sep): "Jo 26 letters hain woh add nahi hoe, bus
# Formation rhymes ke naam se add hogaye hain." She is right: all 26 lines
# went into ONE topic's description, and a description cannot be ticked
# off. The syllabus list is how a teacher marks progress, so each letter
# needs its own row.
#
# The rhyme lines are the same list, in the same teaching order (c, o, a,
# l, d ... - pedagogical, not alphabetical), that seed-preprimary-syllabi.py
# now generates from, so a fresh load and this correction agree exactly.
#
#   python scripts/seed-junior-formation-rhymes.py            # dry run
#   python scripts/seed-junior-formation-rhymes.py --apply
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
YEAR = '2026-27'
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

OLD_SINGLE = "Formation rhymes (letter formation)"

FORMATION_RHYME_LINES = [
    'c is curvy "c".', 'o is round and round.',
    'a is make a "c", go up and come down.', 'l is down and down.',
    'd is make a "c", go up up and come down.',
    'g is make a "c", go up and come down down and turn a little.',
    'n is down and bumpty.', 'm is down and bumpty and bumpty.',
    'r is down, goes up and turn a little.', 'h is down and down then bumpty.',
    'b is down and down, go up and turn around.',
    't is down and down, turn a little with a line across.',
    'u is down, turn go up and come down.',
    'f is like a walking stick with a line across.',
    'j is down and down then turn a little with a dot.',
    'k is down and down and give it a kick.', 's is like a snake.',
    'i is down with a dot.', 'e is draw an eye and turn a little.',
    'p is down and down, goes up, up and turn around.',
    'y make a "v". come down down.', 'v is for victory.',
    'q is make a "c" go up, come down down and give it a kick.',
    'w is like a zig zag.', 'x is make a cross.', 'z is like a zebra crossing.',
]
assert len(FORMATION_RHYME_LINES) == 26, len(FORMATION_RHYME_LINES)
TOPICS = [f"Formation rhyme: {line.rstrip('.')}" for line in FORMATION_RHYME_LINES]

cls = req('GET', f"class?org_id=eq.{ORG}&name=eq.Junior&select=id")[0]
sub = req('GET', f"class_subject?class_id=eq.{cls['id']}&name=eq.{q('English Writing')}"
                 f"&archived_at=is.null&select=id")[0]
cur = req('GET', f"curriculum?class_subject_id=eq.{sub['id']}"
                 f"&academic_year=eq.{q(YEAR)}&select=id")[0]

existing = req('GET', f"curriculum_topic?curriculum_id=eq.{cur['id']}"
                      f"&select=id,name,display_order") or []
by_name = {t['name'].strip().lower(): t for t in existing}
order = max([0] + [t.get('display_order') or 0 for t in existing]) + 1

# 1. Retire the catch-all row - but never if any teaching already points at
#    it, since dropping it would orphan that lesson's topic link.
old = by_name.get(OLD_SINGLE.strip().lower())
if old:
    refs = len(req('GET', f"lesson?curriculum_topic_id=eq.{old['id']}&select=id") or []) \
         + len(req('GET', f"assignment?curriculum_topic_id=eq.{old['id']}&select=id") or [])
    if refs:
        print(f"KEEPING the single row - {refs} lesson(s)/assignment(s) reference it")
        old = None
    else:
        print(f"removing the single catch-all row: {OLD_SINGLE}")
        if APPLY:
            req('DELETE', f"curriculum_topic?id=eq.{old['id']}")
else:
    print(f"(no '{OLD_SINGLE}' row to remove)")

# 2. One row per letter.
added = 0
for name in TOPICS:
    if name.strip().lower() in by_name:
        continue
    print(f"   + {name}")
    if APPLY:
        req('POST', 'curriculum_topic', {
            'curriculum_id': cur['id'], 'name': name,
            'display_order': order, 'academic_term_id': None,
        }, prefer='return=minimal')
    order += 1
    added += 1

print(f"\n{'APPLIED' if APPLY else 'DRY RUN'} - {added} letter rows"
      f"{', catch-all removed' if old else ''}")
