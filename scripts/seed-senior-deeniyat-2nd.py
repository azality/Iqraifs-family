# -*- coding: utf-8 -*-
# Senior Deeniyat, 2nd Assessment - the detail behind the printed sheet
# (Ambreen's notebook, 12 Sep). The six headline topics (kalima, iman-e-
# mujmal, the four duas) were loaded from the printed sheet on 10 Sep;
# the notebook adds what they contain: the three ahadith and questions
# 8-14 with their answers. Each hadith and each question is its own
# TICKABLE topic (the formation-rhymes lesson: a teacher marks items
# off one by one - a description cannot be ticked). Answers and dua
# texts ride along as descriptions for reference.
#
# The notebook page is headed "قرآن سلیبس" but Muneeb: "Deeniyat
# syllabus class senior" - and its content is Deeniyat's (the /20 oral
# subject). Loaded there.
#
#   python scripts/seed-senior-deeniyat-2nd.py            # dry run
#   python scripts/seed-senior-deeniyat-2nd.py --apply
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

# (name, description) - verbatim from the notebook.
TOPICS = [
    ("حدیث: اَلْحُمّٰى شَهَادَةٌ",
     "بخار میں بھی شہادت کا ثواب ہے"),
    ("حدیث: اَلسَّلَامُ قَبْلَ الْكَلَامِ",
     "گفتگو سے پہلے سلام کرو"),
    ("حدیث: مَنْ غَشَّ فَلَيْسَ مِنَّا",
     "جس نے دھوکہ بازی کی وہ ہم میں سے نہیں"),
    ("سوال ۸: بسم اللہ پڑھنے سے کیا ہوتا ہے؟",
     "بسم اللہ پڑھنے سے ہر کام میں برکت ہوتی ہے"),
    ("سوال ۹: نماز کیا ہے؟",
     "نماز اللہ تعالیٰ کی عبادت ہے"),
    ("سوال ۱۰: نماز پڑھنے سے کیا ہوتا ہے؟",
     "اللہ تعالیٰ خوش ہوتا ہے اور جنت ملے گی"),
    ("سوال ۱۱: نماز کس طرف منہ کر کے پڑھتے ہیں؟",
     "نماز خانہ کعبہ کی طرف منہ کر کے پڑھتے ہیں"),
    ("سوال ۱۲: دن رات میں کتنی نمازیں فرض ہیں؟",
     "پانچ نمازیں فرض ہیں"),
    ("سوال ۱۳: پانچوں فرض نمازوں کے نام بتائیں",
     "فجر، ظہر، عصر، مغرب، عشاء"),
    ("سوال ۱۴: دنیا میں سب سے پہلے اللہ تعالیٰ کا گھر کون سا ہے؟",
     "خانہ کعبہ"),
]

# Dua texts from the page attach to the EXISTING dua topics as reference.
DUA_TEXTS = {
    "مسجد میں داخل ہونے کی دعا":    "اَللّٰهُمَّ افْتَحْ لِيْ اَبْوَابَ رَحْمَتِكَ",
    "مسجد سے باہر نکلتے وقت کی دعا": "اَللّٰهُمَّ اِنِّيْ اَسْئَلُكَ مِنْ فَضْلِكَ",
    "کپڑے پہنتے وقت کی دعا":
        "اَلْحَمْدُ لِلّٰهِ الَّذِيْ كَسَانِيْ هٰذَا وَرَزَقَنِيْهِ مِنْ غَيْرِ حَوْلٍ مِّنِّيْ وَلَا قُوَّةٍ",
    "کپڑے اتارتے وقت کی دعا":       "بِسْمِ اللّٰهِ الَّذِيْ لَا اِلٰهَ اِلَّا هُوَ",
}

cls = req('GET', f"class?org_id=eq.{ORG}&name=eq.Senior&select=id")[0]
sub = req('GET', f"class_subject?class_id=eq.{cls['id']}&name=eq.Deeniyat"
                 f"&archived_at=is.null&select=id")[0]
cur = req('GET', f"curriculum?class_subject_id=eq.{sub['id']}&select=id")[0]
term = req('GET', f"academic_term?org_id=eq.{ORG}&name=eq.{q('2nd Assessment')}"
                  f"&archived_at=is.null&select=id")[0]

existing = req('GET', f"curriculum_topic?curriculum_id=eq.{cur['id']}"
                      f"&select=id,name,description,display_order,academic_term_id") or []
have = {(t['name'].strip(), t.get('academic_term_id')) for t in existing}
order = max([0] + [t.get('display_order') or 0 for t in existing]) + 1

added = 0
for name, desc in TOPICS:
    if (name, term['id']) in have:
        continue
    print(f"   + {name}")
    if APPLY:
        req('POST', 'curriculum_topic', {
            'curriculum_id': cur['id'], 'name': name, 'description': desc,
            'display_order': order, 'academic_term_id': term['id'],
        }, prefer='return=minimal')
    order += 1
    added += 1

texted = 0
for t in existing:
    txt = DUA_TEXTS.get(t['name'].strip())
    if txt and not t.get('description'):
        print(f"   ~ dua text onto: {t['name']}")
        texted += 1
        if APPLY:
            req('PATCH', f"curriculum_topic?id=eq.{t['id']}", {'description': txt})

print(f"\n{'APPLIED' if APPLY else 'DRY RUN'} - {added} topics added, "
      f"{texted} dua texts attached")
