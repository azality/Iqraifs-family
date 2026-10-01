// What a subject's remark says when no teacher has written one.
//
// Round 3's design review (2 Oct) set the acceptance test: "after
// reading this, does the parent know one useful thing to try - and
// have we avoided claiming something we don't know?" Band words
// ("Good", "Excellent") fail the first half; the computed findings
// failed the second. With marks-only evidence, the review's own
// answer is an EVIDENCE-FINDING ACTIVITY - "retry two questions where
// marks were lost, then compare with the teacher's corrections" - a
// suggested activity, not a diagnosis.
//
// So the display default is that activity, tiered by how the subject
// went, in English and Urdu (nominal style, no gendered verb endings,
// per the school's own remark conventions). A teacher's saved remark
// always wins; the AI-suggested, teacher-approved remark is still the
// quality ceiling. These are the honest floor.
//
// Grade-mode subjects (Art, Robotics - a letter, no marks) keep the
// band word: with no lost marks to revisit, an activity line would be
// an invention. Ungraded subjects keep "Not graded".

export interface SubjectRemarkDefault {
  en: string;
  ur: string;
}

export function defaultSubjectRemark(args: {
  percentage: number | null;
  passMarkPct: number;
}): SubjectRemarkDefault | null {
  const { percentage, passMarkPct } = args;
  if (percentage === null || !Number.isFinite(percentage)) return null;

  if (percentage < passMarkPct) {
    return {
      en: "Retry two questions where marks were lost, then compare with the teacher's corrections — this shows where help is needed.",
      ur: "جہاں نمبر کم آئے، وہاں کے دو سوال دوبارہ حل کر کے استاد کی تصحیح سے ملائیں — جہاں مدد درکار ہے وہ واضح ہو جائے گا۔",
    };
  }
  if (percentage < 70) {
    return {
      en: "Going over the corrected paper together will show exactly where the remaining marks went.",
      ur: "تصحیح شدہ پرچہ ساتھ بیٹھ کر دیکھنے سے واضح ہو گا کہ باقی نمبر کہاں رہ گئے۔",
    };
  }
  if (percentage < 85) {
    return {
      en: "A good result — reviewing the few lost marks together will show what to polish next.",
      ur: "اچھا نتیجہ ہے — جو تھوڑے نمبر رہ گئے انہیں ساتھ دیکھنے سے اگلی بہتری واضح ہو گی۔",
    };
  }
  return {
    en: "A strong result, Mashallah — an occasional harder exercise will keep it growing.",
    ur: "ماشاءاللہ عمدہ نتیجہ ہے — کبھی کبھار تھوڑی مشکل مشق اسے مزید نکھارے گی۔",
  };
}
