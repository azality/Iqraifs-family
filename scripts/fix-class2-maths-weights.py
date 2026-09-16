#!/usr/bin/env python3
"""Correction (Muneeb, 16 Sep): Class 2 Maths marks distribution is
Oral 5 + Written 70. Idempotent: shows before/after, only writes when
the stored weights differ."""
import json, os, urllib.request

URL = "https://ybrkbrrkcqpzpjnjdyib.supabase.co"
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
ORG = "63cd5732-5db4-40e1-8fb9-60782bcfd059"

def req(method, path, body=None):
    r = urllib.request.Request(f"{URL}{path}", method=method,
        headers={"apikey": KEY, "Authorization": f"Bearer {KEY}",
                 "Content-Type": "application/json", "Prefer": "return=representation"},
        data=json.dumps(body).encode() if body is not None else None)
    with urllib.request.urlopen(r) as resp:
        return json.loads(resp.read().decode() or "null")

classes = req("GET", f"/rest/v1/class?org_id=eq.{ORG}&name=eq.Class%20II&select=id,name")
assert len(classes) == 1, f"expected one Class II, got {classes}"
cid = classes[0]["id"]
subs = req("GET", f"/rest/v1/class_subject?class_id=eq.{cid}&select=id,name,assessment_weights")
maths = [s for s in subs if "math" in s["name"].lower()]
assert len(maths) == 1, f"expected one maths subject in Class 2, got {[s['name'] for s in subs]}"
sub = maths[0]
want = [{"label": "Oral", "marks": 5, "paper": "oral"},
        {"label": "Written", "marks": 70, "paper": "written"}]
print("Class 2 /", sub["name"], "current:", json.dumps(sub["assessment_weights"]))
if sub["assessment_weights"] == want:
    print("Already correct - nothing to do.")
else:
    out = req("PATCH", f"/rest/v1/class_subject?id=eq.{sub['id']}", {"assessment_weights": want})
    print("Updated ->", json.dumps(out[0]["assessment_weights"]))

# The 1st Assessment Oral rows were stamped max_marks=10 under the old
# distribution; obtained marks all fit the new max of 5, so re-stamp the
# max to keep tabulation percentages honest. Idempotent.
scores = req("GET", f"/rest/v1/exam_subject_score?class_subject_id=eq.{sub['id']}"
                    f"&max_marks=eq.10&select=id,obtained_marks,exam:exam_id(name)")
oral = [s for s in scores if "oral" in (s["exam"]["name"] or "").lower()]
over = [s for s in oral if (s["obtained_marks"] or 0) > 5]
assert not over, f"{len(over)} oral marks exceed 5 - fix those with the school first"
if oral:
    ids = ",".join(f'"{s["id"]}"' for s in oral)
    req("PATCH", f"/rest/v1/exam_subject_score?id=in.({ids})", {"max_marks": 5})
    print(f"Re-stamped {len(oral)} oral score rows to max_marks=5.")
else:
    print("No stale oral max stamps to fix.")
