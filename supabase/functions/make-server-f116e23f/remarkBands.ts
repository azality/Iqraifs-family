// Auto remarks from the overall percentage, in one pure place (25 Sep).
//
// "If the student overall is between 95% to 100% this should be the
// comment... 5% increments, with anything before 40% (fail) to have
// fail remarks" - so the class teacher's and principal's remarks
// pre-populate from a band chart the school owns, no AI, no cost.
// A remark a teacher or principal SAVES always wins over the band.
//
// BILINGUAL (26 Sep): each band carries English and Urdu. The card
// returns both and the reader's own language picks - a parent who
// switches to Urdu must not be handed English remarks on an
// Urdu-first portal. The Urdu is written in a NOMINAL style
// ("محنت نمایاں ہے" rather than "محنت کرتا/کرتی ہے") so one chart
// serves boys and girls without gendered verb endings.
//
// The school edits its own chart (org settings key report_remark_bands);
// these defaults apply until they do.

export interface RemarkBand {
  minPct: number;
  /** Exclusive, except the top band where 100 is inclusive. */
  maxPct: number;
  classTeacher: string;
  principal: string;
  /** Urdu counterparts - empty string means "no Urdu written yet",
   *  and the reader falls back to the English text. */
  classTeacherUr?: string;
  principalUr?: string;
}

export const DEFAULT_REMARK_BANDS: RemarkBand[] = [
  {
    minPct: 95, maxPct: 100,
    classTeacher: "Mashallah, an outstanding result. Consistently excellent work in every subject - keep this beautiful habit of effort and dua.",
    principal: "Outstanding. The school is proud of this result - may Allah keep you at the top, Ameen.",
    classTeacherUr: "ماشاءاللہ، نہایت شاندار نتیجہ۔ ہر مضمون میں مسلسل بہترین کارکردگی۔ محنت اور دعا کی یہ عادت برقرار رکھیں۔",
    principalUr: "نہایت شاندار۔ اسکول کو اس نتیجے پر فخر ہے۔ اللہ تعالیٰ ہمیشہ سرفراز رکھے، آمین۔",
  },
  {
    minPct: 90, maxPct: 95,
    classTeacher: "Mashallah, an excellent result. Works with focus and sets a fine example for the class.",
    principal: "Excellent performance. Keep it up - we expect the same brilliance next term, Inshallah.",
    classTeacherUr: "ماشاءاللہ، بہترین نتیجہ۔ توجہ اور محنت نمایاں ہے، اور کلاس کے لیے عمدہ مثال۔",
    principalUr: "بہترین کارکردگی۔ اسی طرح جاری رکھیں — اگلے ٹرم میں بھی یہی کامیابی متوقع ہے، ان شاء اللہ۔",
  },
  {
    minPct: 85, maxPct: 90,
    classTeacher: "A very good result. Hardworking and attentive - a little more polish will place them among the very best.",
    principal: "Very good. Stay consistent and the top positions are within reach, Inshallah.",
    classTeacherUr: "بہت اچھا نتیجہ۔ محنت اور توجہ نمایاں ہے — تھوڑی سی مزید محنت سے نمایاں ترین مقام ممکن ہے۔",
    principalUr: "بہت اچھا۔ تسلسل برقرار رہا تو اعلیٰ پوزیشن دور نہیں، ان شاء اللہ۔",
  },
  {
    minPct: 80, maxPct: 85,
    classTeacher: "A very good effort this term. Understands the lessons well; regular revision will lift the result further.",
    principal: "Very good result. Keep the momentum going next term.",
    classTeacherUr: "اس ٹرم میں بہت اچھی کوشش۔ اسباق کی سمجھ اچھی ہے؛ باقاعدہ دہرائی سے نتیجہ مزید بہتر ہوگا۔",
    principalUr: "بہت اچھا نتیجہ۔ اگلے ٹرم میں بھی یہی رفتار برقرار رکھیں۔",
  },
  {
    minPct: 75, maxPct: 80,
    classTeacher: "A good result. Participates well in class - steadier written practice will raise the marks.",
    principal: "Good performance. With a little more effort, even better is possible, Inshallah.",
    classTeacherUr: "اچھا نتیجہ۔ کلاس میں شرکت عمدہ ہے — تحریری مشق میں تسلسل سے نمبر مزید بڑھیں گے۔",
    principalUr: "اچھی کارکردگی۔ تھوڑی مزید محنت سے اس سے بھی بہتر ممکن ہے، ان شاء اللہ۔",
  },
  {
    minPct: 70, maxPct: 75,
    classTeacher: "A good effort. Grasps the concepts; daily revision at home will make the result stronger.",
    principal: "Good. We look forward to an improved result next term.",
    classTeacherUr: "اچھی کوشش۔ مضامین کی سمجھ موجود ہے؛ گھر پر روزانہ دہرائی سے نتیجہ مضبوط ہوگا۔",
    principalUr: "اچھا۔ اگلے ٹرم میں بہتر نتیجے کی امید ہے۔",
  },
  {
    minPct: 65, maxPct: 70,
    classTeacher: "A fair result. Capable of much more - regular homework and revision are the key.",
    principal: "Satisfactory. More consistent study will show clear improvement, Inshallah.",
    classTeacherUr: "نتیجہ مناسب ہے۔ صلاحیت اس سے کہیں زیادہ ہے — باقاعدہ ہوم ورک اور دہرائی ہی کلید ہے۔",
    principalUr: "قابلِ قبول۔ مسلسل مطالعے سے واضح بہتری آئے گی، ان شاء اللہ۔",
  },
  {
    minPct: 60, maxPct: 65,
    classTeacher: "A fair result with room to grow. Needs steadier attention in class and daily practice at home.",
    principal: "Satisfactory. Please encourage daily revision at home.",
    classTeacherUr: "نتیجہ مناسب ہے، مگر بہتری کی گنجائش ہے۔ کلاس میں زیادہ توجہ اور گھر پر روزانہ مشق درکار ہے۔",
    principalUr: "قابلِ قبول۔ براہِ کرم گھر پر روزانہ دہرائی کی حوصلہ افزائی کریں۔",
  },
  {
    minPct: 55, maxPct: 60,
    classTeacher: "An average result. Understands when guided - needs regular practice and help with weaker subjects.",
    principal: "Average performance. Focused effort on the weaker subjects will help, Inshallah.",
    classTeacherUr: "اوسط نتیجہ۔ رہنمائی ملنے پر سمجھ آ جاتی ہے — کمزور مضامین میں باقاعدہ مشق اور مدد کی ضرورت ہے۔",
    principalUr: "اوسط کارکردگی۔ کمزور مضامین پر خصوصی توجہ سے بہتری آئے گی، ان شاء اللہ۔",
  },
  {
    minPct: 50, maxPct: 55,
    classTeacher: "An average result. Please ensure daily homework and revision - the ability is there.",
    principal: "Average. We request the parents' support with daily study at home.",
    classTeacherUr: "اوسط نتیجہ۔ براہِ کرم روزانہ ہوم ورک اور دہرائی کو یقینی بنائیں — صلاحیت موجود ہے۔",
    principalUr: "اوسط۔ گھر پر روزانہ مطالعے میں والدین کے تعاون کی درخواست ہے۔",
  },
  {
    minPct: 45, maxPct: 50,
    classTeacher: "A below-average result. Needs serious, regular effort - please work closely with the class teacher.",
    principal: "Below average. Parents are requested to meet the class teacher to plan support.",
    classTeacherUr: "نتیجہ اوسط سے کم رہا۔ سنجیدہ اور باقاعدہ محنت درکار ہے — براہِ کرم کلاس ٹیچر سے رابطے میں رہیں۔",
    principalUr: "اوسط سے کم۔ والدین سے درخواست ہے کہ کلاس ٹیچر سے ملاقات کر کے لائحہ عمل طے کریں۔",
  },
  {
    minPct: 40, maxPct: 45,
    classTeacher: "A weak result this term. Extra attention at school and home is needed - we will support every step.",
    principal: "Needs improvement. Please meet the class teacher so we can plan extra support together.",
    classTeacherUr: "اس ٹرم نتیجہ کمزور رہا۔ اسکول اور گھر دونوں جگہ اضافی توجہ درکار ہے — ہم ہر قدم پر تعاون کریں گے۔",
    principalUr: "بہتری درکار ہے۔ براہِ کرم کلاس ٹیچر سے ملاقات کریں تاکہ مل کر اضافی مدد کا منصوبہ بنایا جا سکے۔",
  },
  {
    minPct: 0, maxPct: 40,
    classTeacher: "Did not meet the pass mark this term. With regular attendance, completed homework and our support, improvement is fully possible, Inshallah.",
    principal: "Result below the pass mark. Parents are requested to meet the school so we can plan the way forward together.",
    classTeacherUr: "اس ٹرم کامیابی کے نمبر حاصل نہیں ہو سکے۔ باقاعدہ حاضری، مکمل ہوم ورک اور ہمارے تعاون سے بہتری یقیناً ممکن ہے، ان شاء اللہ۔",
    principalUr: "نتیجہ کامیابی کی حد سے کم رہا۔ والدین سے درخواست ہے کہ اسکول آ کر ملاقات کریں تاکہ مل کر آئندہ کا لائحہ عمل طے کیا جا سکے۔",
  },
];

/** Settings rows are data from the org - keep only well-formed bands.
 *  The Urdu fields are optional so a chart saved before 26 Sep (or by
 *  a school that only writes English) still loads. */
export function normalizeRemarkBands(raw: unknown): RemarkBand[] | null {
  if (!Array.isArray(raw)) return null;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const out: RemarkBand[] = [];
  for (const r of raw as any[]) {
    const minPct = Number(r?.minPct);
    const maxPct = Number(r?.maxPct);
    if (!Number.isFinite(minPct) || !Number.isFinite(maxPct) || maxPct <= minPct) continue;
    out.push({
      minPct, maxPct,
      classTeacher: str(r?.classTeacher),
      principal: str(r?.principal),
      classTeacherUr: str(r?.classTeacherUr),
      principalUr: str(r?.principalUr),
    });
  }
  return out.length > 0 ? out : null;
}

/** The band a percentage falls in - top band inclusive at 100, the
 *  rest [min, max). Null percentage (no marks) gets NO auto remark:
 *  a template sentence about performance that never happened would
 *  mislead (the blank-card children taught us that). */
export function pickRemarkBand(bands: RemarkBand[], pct: number | null): RemarkBand | null {
  if (pct === null || !Number.isFinite(pct)) return null;
  for (const b of bands) {
    if (b.maxPct >= 100 && pct >= b.minPct && pct <= 100) return b;
    if (pct >= b.minPct && pct < b.maxPct) return b;
  }
  return null;
}
