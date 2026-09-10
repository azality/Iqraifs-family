# -*- coding: utf-8 -*-
# The school's marks distribution per subject (Ambreen, 10 Sep 2026).
# Components carry MARKS and the paper they sit on; each paper's total
# becomes the max for that subject's column on the marks sheet.
#
# Dictation counts toward the WRITTEN paper - the sheet writes it that
# way: "English /60, written 50, dictation 10".
#
#   python scripts/seed-marks-distribution.py           # dry run
#   python scripts/seed-marks-distribution.py --apply
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

def req(method, path, body=None):
    r = urllib.request.Request(URL + '/rest/v1/' + path, method=method,
        data=json.dumps(body).encode() if body is not None else None, headers=H)
    with urllib.request.urlopen(r) as resp:
        t = resp.read().decode()
        return json.loads(t) if t.strip() else None

def q(s): return urllib.parse.quote(str(s), safe='')

def W(written, oral, dictation=None, labels=("Written", "Oral", "Dictation")):
    out = [{"label": labels[0], "marks": written, "paper": "written"}]
    if dictation:
        out.append({"label": labels[2], "marks": dictation, "paper": "written"})
    out.append({"label": labels[1], "marks": oral, "paper": "oral"})
    return out

URDU_47 = [
    {"label": "تحریری", "marks": 65, "paper": "written"},
    {"label": "املا",   "marks": 5,  "paper": "written"},
    {"label": "زبانی",  "marks": 5,  "paper": "oral"},
]

PLAN = {
    "Class I": {
        "English":        W(50, 15, dictation=10),
        "Urdu":           W(50, 15, dictation=10),
        "Maths":          W(55, 20),
        "Islamiat":       W(50, 25),
        "Science":        W(60, 15),
        "Computer":       W(70, 5),
        "Social Studies": W(70, 5),
    },
    "Class III": {
        "English":        W(65, 5, dictation=5),
        "Urdu":           W(65, 5, dictation=5),
        "Maths":          W(70, 5),
        "Islamiat":       W(60, 15),
        "Science":        W(70, 5),
        "Computer":       W(70, 5),
        "Social Studies": W(70, 5),
    },
    # Classes IV-VII spell it "Islamiyat"; I-III use "Islamiat".
    # Social Studies IV-VII: written 65 + oral 10 = 75.
    "Class IV":  {"Urdu": URDU_47, "Islamiyat": W(65, 10), "Social Studies": W(65, 10)},
    "Class V":   {"Urdu": URDU_47, "Islamiyat": W(65, 10), "Social Studies": W(65, 10)},
    "Class VI":  {"Urdu": URDU_47, "Islamiyat": W(65, 10), "Social Studies": W(65, 10)},
    "Class VII": {"Urdu": URDU_47, "Islamiyat": W(65, 10), "Social Studies": W(65, 10)},
}

# Quran carries 50 marks in Classes I-VIII. It is recited, not written,
# so the 50 sits on the ORAL paper - flagged to Muneeb (10 Sep) in case
# the school sets a written Quran paper instead. Classes I and II call
# the subject "Nazra"; III upward call it "Quran".
QURAN = [{"label": "Quran", "marks": 50, "paper": "oral"}]
for _cls, _name in [
    ("Class I", "Nazra"), ("Class II", "Nazra"), ("Class III", "Quran"),
    ("Class IV", "Quran"), ("Class V", "Quran"), ("Class VI", "Quran"),
    ("Class VII", "Quran"), ("Class VIII", "Quran"),
]:
    PLAN.setdefault(_cls, {})[_name] = QURAN

changed = missing = same = 0
for cls_name, subjects in PLAN.items():
    cls = req('GET', f"class?org_id=eq.{ORG}&name=eq.{q(cls_name)}&select=id,name")
    if not cls:
        print(f"!! class not found: {cls_name}"); continue
    have = {s['name']: s for s in req(
        'GET', f"class_subject?class_id=eq.{cls[0]['id']}&archived_at=is.null"
               f"&select=id,name,assessment_weights")}
    for sub_name, weights in subjects.items():
        s = have.get(sub_name)
        if not s:
            print(f"!! {cls_name}: subject not found -> {sub_name}")
            missing += 1
            continue
        w = sum(x['marks'] for x in weights if x['paper'] == 'written')
        o = sum(x['marks'] for x in weights if x['paper'] == 'oral')
        if s.get('assessment_weights') == weights:
            same += 1
            continue
        print(f"{cls_name} / {sub_name}: written /{w} + oral /{o} = {w + o}"
              f"   [{', '.join(f'{x['label']} {x['marks']}' for x in weights)}]")
        changed += 1
        if APPLY:
            req('PATCH', f"class_subject?id=eq.{s['id']}", {'assessment_weights': weights})

print(f"\n{'APPLIED' if APPLY else 'DRY RUN'} — {changed} subjects set, "
      f"{same} already correct, {missing} not found")
