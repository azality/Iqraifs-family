# -*- coding: utf-8 -*-
# Junior Urdu Writing — حروف تہجی کی بناوٹ tail fix. Ambreen's clearer
# photos (13 Sep) of the last page resolve the two rows the first photo
# left illegible, and show the batch-2 load misassigned two letters:
#
#   the "چھوٹا چاند، ترچھا" line loaded as ی is actually  ء
#   the "گول «د» کی شکل" line loaded as   ے is actually  ھ  (and reads لکیر, not تیر)
#   the real ی and ے rows were the two illegible ones - added here
#
# Tail order follows the notebook: ... و ہ ء ی ے ھ. The clearer page also
# corrects small wordings on ک گ ل م ن ہ (verbatim rule).
#
#   python scripts/fix-junior-bunawat-tail.py            # dry run
#   python scripts/fix-junior-bunawat-tail.py --apply
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
H = {'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json'}
CUR = '4418050d-3924-4e01-a0d6-1d46f4108cce'  # Junior Urdu Writing 2026-27

def req(method, path, body=None, prefer=None):
    h = dict(H)
    if prefer: h['Prefer'] = prefer
    r = urllib.request.Request(URL + '/rest/v1/' + path, method=method,
        data=json.dumps(body).encode() if body is not None else None, headers=h)
    with urllib.request.urlopen(r) as resp:
        t = resp.read().decode()
        return json.loads(t) if t.strip() else None

def name(l, t): return "بناوٹ: %s — %s" % (l, t)

# letter -> corrected text, per the clearer photos
RENAME = {
    # misassigned letters (old loaded name -> corrected name)
    name("ی", "ایک چھوٹا چاند بنائیں، ترچھا اُتر کر رک جائیں"):
        name("ء", "ایک چھوٹا چاند بنائیں، ترچھا آ کر رک جائیں"),
    name("ے", "نقطے سے گول «د» کی شکل جیسا بنائیں، اوپر آئیں، درمیان سے تیر باہر کی طرف بنائیں"):
        name("ھ", "نقطے سے گول «د» کی شکل جیسا بنائیں، اوپر آئیں، درمیان سے لکیر باہر کی طرف بنائیں"),
    # small wording corrections
    name("ک", "نقطے سے نیچے آئیں، دائیں سے بائیں کشتی بنائیں، اوپر ایک مرکز لگائیں"):
        name("ک", "نقطے سے نیچے آئیں، دائیں سے بائیں کشتی بنائیں اور اوپر ایک مرکز لگائیں"),
    name("گ", "نقطے سے نیچے آئیں، دائیں سے بائیں کشتی بنائیں، اوپر دو مرکز لگائیں"):
        name("گ", "نقطے سے نیچے آئیں، دائیں سے بائیں کشتی بنائیں اور اوپر دو مرکز لگائیں"),
    name("ل", "نیچے سے ایک گول پیالہ بنائیں"):
        name("ل", "نقطے سے نیچے آئیں، ایک گول پیالہ بنائیں"),
    name("م", "نقطے سے ایک گول سر بنائیں، تھوڑا آگے آئیں، نیچے اُتر کر رک جائیں"):
        name("م", "نقطے سے ایک گول سر بنائیں، تھوڑا آگے آئیں، نیچے آ کر رک جائیں"),
    name("ن", "ایک گول پیالہ بنائیں، اوپر ایک نقطہ لگائیں"):
        name("ن", "ایک گول پیالہ بنائیں اور اوپر ایک نقطہ لگائیں"),
    name("ہ", "نقطے سے نیچے اُتر کر گول بنائیں، اوپر آ کر رک جائیں"):
        name("ہ", "نقطے سے نیچے آ کر گول بنائیں، اوپر آ کر رک جائیں"),
}

NEW_ROWS = [  # the two previously-illegible rows, notebook order after ء
    name("ی", "تھوڑا دائیں جائیں، خم دار لکیر بنائیں، پھر اسے نیچے کی طرف گول پیالہ نما بنائیں"),
    name("ے", "نیچے آئیں، تھوڑا آگے آئیں، گول گھما کر سیدھے آئیں"),
]

tops = req('GET', f"curriculum_topic?curriculum_id=eq.{CUR}"
                  f"&select=id,name,display_order&order=display_order")
by_name = {t['name']: t for t in tops}

# 1. renames
for old, new in RENAME.items():
    t = by_name.get(old)
    if t:
        print(f" ~ {old}\n   -> {new}")
        if APPLY:
            req('PATCH', f"curriculum_topic?id=eq.{t['id']}", {'name': new},
                prefer='return=minimal')
    elif new in by_name:
        print(f" (already renamed: {new[:40]}...)")
    else:
        print(f" !! not found: {old}")

# 2. tail order ... و ہ ء ی ے ھ, everything after shifts by +2
ha = by_name.get(name("ہ", "نقطے سے نیچے اُتر کر گول بنائیں، اوپر آ کر رک جائیں")) \
  or by_name.get(name("ہ", "نقطے سے نیچے آ کر گول بنائیں، اوپر آ کر رک جائیں"))
assert ha, "ہ row not found"
base = ha['display_order']            # ء=base+1, ی=base+2, ے=base+3, ھ=base+4
old_ye = by_name.get(list(RENAME)[0])  # was order base+1 -> stays (becomes ء)
old_be = by_name.get(list(RENAME)[1])  # was order base+2 -> moves to base+4 (becomes ھ)

if not any(n in by_name for n in NEW_ROWS):
    for t in tops:  # shift ranges/detail/legacy rows down by 2
        if t['display_order'] > base + 2:
            if APPLY:
                req('PATCH', f"curriculum_topic?id=eq.{t['id']}",
                    {'display_order': t['display_order'] + 2}, prefer='return=minimal')
    if old_be:
        print(f" ~ move ھ to {base + 4}")
        if APPLY:
            req('PATCH', f"curriculum_topic?id=eq.{old_be['id']}",
                {'display_order': base + 4}, prefer='return=minimal')
    for i, n in enumerate(NEW_ROWS):
        print(f" + {n}")
        if APPLY:
            req('POST', 'curriculum_topic', {
                'curriculum_id': CUR, 'name': n,
                'display_order': base + 2 + i, 'academic_term_id': None,
            }, prefer='return=minimal')
else:
    print(" (new rows already present - skipping insert/shift)")

print("APPLIED" if APPLY else "DRY RUN - re-run with --apply")
