// Pre-built curriculum templates for common Pakistani-school subjects.
//
// One-click drop these into a fresh syllabus, then the admin edits / reorders
// to match the school's chosen textbooks (Punjab Curriculum and Textbook
// Board, Sindh, Federal, OUP, etc.). The lists are intentionally generic
// across boards so the templates are useful as a starting point regardless
// of which board the school follows.
//
// Templates are keyed by the canonical subject name (case-insensitive
// lookup). Match against the subject's name on the class_subject row.

export interface CurriculumTemplate {
  /** Subject name (case-insensitive match). */
  match: string;
  /** Topics in syllabus order — admin can edit / reorder before saving. */
  topics: string[];
}

export const CURRICULUM_TEMPLATES: CurriculumTemplate[] = [
  {
    match: "math",
    topics: [
      "Numbers up to 10000 — place value, comparison, ordering",
      "Addition and subtraction (carrying, borrowing)",
      "Multiplication tables (1–12)",
      "Multiplication (multi-digit) and division",
      "Fractions — halves, quarters, equivalent fractions",
      "Decimals — tenths and hundredths",
      "Measurement — length, mass, capacity",
      "Time — analog & digital, calendar work",
      "Money — currency, simple problems",
      "Geometry — points, lines, angles, 2D shapes",
      "Perimeter and area (rectangles and squares)",
      "Data handling — bar graphs, pictographs",
      "Patterns and number sequences",
      "Word problems and mental math",
    ],
  },
  {
    match: "english",
    topics: [
      "Alphabet review — capital and small letters",
      "Phonics and blending",
      "Nouns — common, proper, singular, plural",
      "Pronouns",
      "Verbs — action words, present / past / future",
      "Adjectives — describing words",
      "Articles — a, an, the",
      "Prepositions — in, on, under, between",
      "Sentence structure — capital letters, punctuation",
      "Reading comprehension — short passages",
      "Creative writing — short paragraphs",
      "Vocabulary building — synonyms, antonyms",
      "Story writing and sequencing",
      "Letter writing — informal letters",
    ],
  },
  {
    match: "urdu",
    topics: [
      "Huroof-e-Tahajji aur Awaazein",
      "Alfaaz ki shanakht aur jumla saazi",
      "Ism, fail, sifat — bunyadi qisamain",
      "Wahid aur jama",
      "Muzakkar aur Moannas",
      "Zameer (pronouns)",
      "Mukhalif alfaaz aur hum-maani alfaaz",
      "Muhavare aur zarbul amsaal",
      "Nazm aur ghazliyat — tashreeh",
      "Kahani sunaana aur likhna",
      "Khat likhna — gher rasmi",
      "Insha aur mazmoon nigaari",
      "Imla aur sahih hijje",
      "Ramooz-e-auqaaf",
    ],
  },
  {
    match: "science",
    topics: [
      "Living and non-living things",
      "Plants — parts, types, life cycle",
      "Animals — vertebrates / invertebrates, habitats",
      "Human body — organs and senses",
      "Healthy living — food groups, hygiene",
      "States of matter — solid, liquid, gas",
      "Heat, light, and sound",
      "Force and motion",
      "Magnets",
      "Earth — land, water, atmosphere",
      "Weather and seasons",
      "Solar system and stars",
      "Environment and pollution",
      "Simple machines",
    ],
  },
  {
    match: "social studies",
    topics: [
      "Family and community",
      "Pakistan — provinces, capitals, geography",
      "Map skills — directions, scale, symbols",
      "Climate and natural resources of Pakistan",
      "Famous personalities of Pakistan",
      "Pakistan movement — basic timeline",
      "Government of Pakistan — basics",
      "Citizenship and civic responsibilities",
      "Cultures and festivals",
      "Trade, transport, and communication",
      "World — continents and oceans",
      "Current affairs",
    ],
  },
  {
    match: "islamiat",
    topics: [
      "Iman aur Aqeeda (basics)",
      "Allah ke Sifat-e-Asma-ul-Husna",
      "Sirat-un-Nabi ﷺ — early life",
      "Sirat-un-Nabi ﷺ — Hijrat and Madina",
      "Khulafa-e-Rashideen — basics",
      "Arkan-e-Islam — Shahadah, Salah, Sawm, Zakat, Hajj",
      "Wuzu aur Tahaarat",
      "Salah ka tareeqa",
      "Daily duas (sleeping, eating, travel, etc.)",
      "Surahs to memorise — last 10 of Juz Amma",
      "Akhlaq — honesty, kindness, respect",
      "Halaal aur Haraam — basic awareness",
      "Hadith mubarak ka mafhoom",
      "Quran-e-Pak ki ahmiyat",
    ],
  },
  {
    match: "quran",
    topics: [
      "Qaida — huroof and harakat",
      "Madd letters and rules",
      "Tanween and sukoon",
      "Tashdeed",
      "Lam Qamariyya and Lam Shamsiyya",
      "Hamzat al-Wasl",
      "Stop signs (Waqf) basics",
      "Surah Al-Fatihah — memorisation",
      "Last 10 surahs of Juz Amma — memorisation",
      "Tajweed — Idgham, Ikhfa, Iqlab, Izhar",
      "Hifz revision — sabaq, sabqi, manzil",
      "Translation of memorised surahs",
    ],
  },
  {
    match: "computer",
    topics: [
      "Parts of a computer — input / output / processing",
      "Using a mouse and keyboard",
      "Operating system basics — files and folders",
      "Word processing — typing, formatting",
      "Internet basics — safe browsing",
      "Email basics",
      "Spreadsheets — entering data, simple formulas",
      "Presentations — slides and templates",
      "Drawing and paint applications",
      "Introduction to algorithms",
      "Block-based programming (e.g. Scratch)",
      "Computer ethics and digital citizenship",
    ],
  },
];

/** Look up a template by subject name (case-insensitive). */
export function templateForSubject(name: string): CurriculumTemplate | null {
  const lower = name.toLowerCase().trim();
  return (
    CURRICULUM_TEMPLATES.find((t) => t.match === lower) ??
    CURRICULUM_TEMPLATES.find((t) => lower.includes(t.match)) ??
    null
  );
}
