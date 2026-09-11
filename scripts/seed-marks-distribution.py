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

# Some subjects sit on ONE paper only - pre-primary Senior is examined as
# six oral components and three short written papers, with no subject
# carrying both.
def ORAL(marks, label="Oral"):
    return [{"label": label, "marks": marks, "paper": "oral"}]

def WRITTEN(marks, label="Written"):
    return [{"label": label, "marks": marks, "paper": "written"}]

# "This subject sits NO paper" - stored as an EMPTY components array,
# distinct from null (= no distribution entered yet, sheet default
# applies). The marks sheet drops a []-subject's column on every paper;
# a null subject keeps its columns. Ambreen (11 Sep): "Material activity
# aur Islamic Studies / English Core reader ka paper nahi hota."
NOT_EXAMINED = []

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
        # No dictation split given for Sindhi III (11 Sep) - unlike IV-VII.
        "Sindhi":         W(70, 5),
    },
    # Every Class II subject is out of 75: the two languages carry a
    # 10-mark dictation inside the written paper, the rest do not.
    "Class II": {
        "English":        W(55, 10, dictation=10),
        "Urdu":           W(60, 5,  dictation=10),
        "Maths":          W(65, 10),
        "Islamiat":       W(65, 10),
        "Science":        W(70, 5),
        "Computer":       W(70, 5),
        "Social Studies": W(70, 5),
    },
}

# ---------------------------------------------------------------- IV-VII
# Classes IV-VII spell it "Islamiyat"; I-III use "Islamiat". Every subject
# here totals 75.
#   Social Studies : written 65 + oral 10
#   Islamiyat      : written 65 + oral 10
#   English        : written 60 + dictation 5 + oral 10 ("reading and
#                    conversation")
#   Sindhi         : written 65 + dictation 5 + oral 5 - the same shape as
#                    Urdu, which the school describes with the same words
#   Maths          : written 60 + oral 15, the oral being "Mind Maths"
#   Computer       : written 65 + oral 10 (viva)
#   Science        : split by class (Ambreen's correction, 11 Sep) -
#                    IV-V sit a single written paper of 75, no oral;
#                    VI-VII keep written 70 + a 5-mark presentation chart
SINDHI_47 = W(65, 5, dictation=5)
ENGLISH_47 = W(60, 10, dictation=5)
MATHS_47 = W(60, 15, labels=("Written", "Oral (Mind Maths)", "Dictation"))
COMPUTER_47 = W(65, 10, labels=("Written", "Oral (viva)", "Dictation"))
SCIENCE_67 = W(70, 5, labels=("Written", "Oral (presentation chart)", "Dictation"))
for _cls in ["Class IV", "Class V", "Class VI", "Class VII"]:
    PLAN.setdefault(_cls, {}).update({
        "Urdu": URDU_47, "Islamiyat": W(65, 10), "Social Studies": W(65, 10),
        "English": ENGLISH_47, "Sindhi": SINDHI_47,
        "Maths": MATHS_47, "Computer": COMPUTER_47,
        "Science": SCIENCE_67 if _cls in ("Class VI", "Class VII") else WRITTEN(75),
    })

# ---------------------------------------------------------------- Senior
# Pre-primary Senior is examined differently from the graded classes: six
# ORAL components (90 marks in total) and three short WRITTEN papers of 25.
# No Senior subject carries both papers, so each one is single-sided.
# Ambreen (11 Sep): "material activity ka nahi hota paper aur jo uss main
# islamic studies hai uss ka bhi nahi hota; yeh jo islamiyat ke 20 marks
# hai yeh deeniyat main hi aayen ge" - the /20 oral is DEENIYAT's; the
# Islamic Studies / English Core readers subject and Material Activity
# sit no paper at all. CLEAR (None) removes a distribution set earlier.
PLAN["Senior"] = {
    "Radiant Way Reading":                          ORAL(10),
    "Ufaq Zakhera (Urdu Reading) and Urdu Core Reader Books": ORAL(10),
    # The school's sheet splits this subject's oral in two, matching how
    # its syllabus is already written ("G.K (oral): ..." / "1000 Pictures: ...").
    "1000 Picture Reading (G.K)": [
        {"label": "G.K",          "marks": 10, "paper": "oral"},
        {"label": "1000 Pictures", "marks": 10, "paper": "oral"},
    ],
    "Norani Qaidah":                                ORAL(30),
    "Deeniyat":                                     ORAL(20),
    "Islamic Studies / English Core readers":       NOT_EXAMINED,
    "Material Activity":                            NOT_EXAMINED,
    "English Writing":                              WRITTEN(25),
    "Maths Writing":                                WRITTEN(25),
    "Urdu Writing":                                 WRITTEN(25),
}

# ------------------------------------------------------------- VIII-X
# The matric wing follows the Sindh board pattern (Ambreen's notebook,
# 11 Sep): every subject is a single WRITTEN paper - 75 marks, except
# English in IX and X which is /100 - and only Quran (VIII) has an oral.
# Her "P.st" is the DB's "Social Studies" in VIII and "Pakistan Studies"
# in X; "Computer/Biology" means each student sits one of the two, so
# both subjects carry the same /75.
PLAN["Class VIII"] = {
    n: WRITTEN(75) for n in [
        "English", "Urdu", "Maths", "Science", "Computer",
        "Social Studies", "Islamiyat", "Sindhi",
    ]
}
PLAN["Class IX"] = {
    "English": WRITTEN(100),
    **{n: WRITTEN(75) for n in [
        "Urdu", "Maths", "Islamiyat", "Physics", "Chemistry",
        "Computer", "Biology",
    ]},
}
PLAN["Class X"] = {
    "English": WRITTEN(100),
    **{n: WRITTEN(75) for n in [
        "Maths", "Pakistan Studies", "Sindhi", "Physics", "Chemistry",
        "Biology", "Computer",
    ]},
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
        if weights == NOT_EXAMINED and weights is not None:
            if s.get('assessment_weights') == []:
                same += 1
            else:
                print(f"{cls_name} / {sub_name}: NOT EXAMINED (no paper, no column)")
                changed += 1
                if APPLY:
                    req('PATCH', f"class_subject?id=eq.{s['id']}", {'assessment_weights': []})
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
