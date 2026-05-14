// Data for the "Guess the Prophet" game.
//
// IMPORTANT — REVIEW BEFORE PRODUCTION:
//   Every attribute below was set based on mainstream Sunni Islamic
//   understanding, but I'm an AI assistant and these facts about
//   Prophets are sensitive. Muneeb should verify the table against
//   an authoritative source (e.g. Tafsir Ibn Kathir's "Stories of
//   the Prophets", Maariful Quran, or a qualified scholar) before
//   the game ships to real users.
//
//   Where I'm uncertain, the attribute is set to `null` so the game
//   answers "I don't know" rather than guessing. Each `null` has a
//   `// TODO verify:` comment explaining what I was unsure about.
//
// Game rules the data must support:
//   - System picks a Prophet, kid asks yes/no questions, kid guesses.
//   - Each QUESTION points to one ATTRIBUTE on the Prophet record.
//   - Answer is `attributes[attribute]` — true / false / null.
//   - null = "I don't know — try a different question."
//
// To add a new question:
//   1. Add the attribute key to PROPHETS records (with true/false/null per Prophet).
//   2. Add a row to QUESTIONS pointing to that attribute key.
//
// To add a Prophet: append to PROPHETS. Make sure attributes object
// has every key in the attribute schema (use null for unknown).

// =============================================================================
// Attribute schema — order documented here so reviewers can scan vertically
// =============================================================================
// Era:
//   first_human, lived_unusually_long, lived_before_ibrahim,
//   last_prophet
// Family:
//   was_descendant_of_ibrahim, had_brother_who_was_also_prophet,
//   had_son_who_became_prophet, was_father_of_a_prophet
// Mission:
//   one_of_ulu_al_azm,         (the 5 great messengers: Nuh, Ibrahim, Musa, Isa, Muhammad)
//   received_major_book,       (Tawrah, Zaboor, Injil, Quran)
//   received_quran,
//   sent_to_arabia,            (Hud→Ad, Salih→Thamud, Muhammad→Quraysh)
//   sent_to_bani_israel
// Location:
//   lived_in_arabia, lived_in_egypt, lived_in_palestine_or_levant
// Miracles & marked events:
//   built_an_ark, was_thrown_into_fire, was_swallowed_by_whale,
//   spoke_to_allah_directly, stick_became_snake, could_command_jinn,
//   could_understand_animals, was_born_without_father,
//   was_taken_up_alive, was_a_king, was_a_minister_or_high_official,
//   was_tested_with_severe_illness
// =============================================================================

export interface ProphetRecord {
  id: string;
  name: string;
  nameArabic: string;
  englishName: string | null;
  /** Each value: true | false | null (null = "I don't know") */
  attributes: Record<string, boolean | null>;
  /**
   * Short kid-friendly description (2-3 sentences). Shown at end of
   * round so the kid learns who the Prophet was even if they didn't
   * guess. Populated below from PROPHET_DESCRIPTIONS at module init,
   * so it's optional on the literal but always set after import.
   */
  description?: string;
}

export const PROPHETS: ProphetRecord[] = [
  {
    id: "adam",
    name: "Adam",
    nameArabic: "آدم",
    englishName: "Adam",
    attributes: {
      first_human: true,
      lived_unusually_long: true,
      lived_before_ibrahim: true,
      last_prophet: false,
      was_descendant_of_ibrahim: false,
      had_brother_who_was_also_prophet: false,
      had_son_who_became_prophet: null, // TODO verify: Shith is a Prophet per some traditions
      was_father_of_a_prophet: null,    // TODO verify same
      one_of_ulu_al_azm: false,
      received_major_book: false,        // received scrolls, not one of the 4 major books
      received_quran: false,
      sent_to_arabia: false,
      sent_to_bani_israel: false,
      lived_in_arabia: false,
      lived_in_egypt: false,
      lived_in_palestine_or_levant: false,
      built_an_ark: false,
      was_thrown_into_fire: false,
      was_swallowed_by_whale: false,
      spoke_to_allah_directly: true,     // spoke with Allah in Jannah and after
      stick_became_snake: false,
      could_command_jinn: false,
      could_understand_animals: false,
      was_born_without_father: true,     // created directly by Allah, no parents
      was_taken_up_alive: false,
      was_a_king: false,
      was_a_minister_or_high_official: false,
      was_tested_with_severe_illness: false,
    },
  },
  {
    id: "idris",
    name: "Idris",
    nameArabic: "إدريس",
    englishName: "Enoch",
    attributes: {
      first_human: false,
      lived_unusually_long: true,
      lived_before_ibrahim: true,
      last_prophet: false,
      was_descendant_of_ibrahim: false,
      had_brother_who_was_also_prophet: false,
      had_son_who_became_prophet: false,
      was_father_of_a_prophet: false,
      one_of_ulu_al_azm: false,
      received_major_book: false,
      received_quran: false,
      sent_to_arabia: false,
      sent_to_bani_israel: false,
      lived_in_arabia: false,
      lived_in_egypt: false,
      lived_in_palestine_or_levant: false,
      built_an_ark: false,
      was_thrown_into_fire: false,
      was_swallowed_by_whale: false,
      spoke_to_allah_directly: null,     // TODO verify
      stick_became_snake: false,
      could_command_jinn: false,
      could_understand_animals: false,
      was_born_without_father: false,
      was_taken_up_alive: true,          // raised by Allah per Qur'an 19:57
      was_a_king: false,
      was_a_minister_or_high_official: false,
      was_tested_with_severe_illness: false,
    },
  },
  {
    id: "nuh",
    name: "Nuh",
    nameArabic: "نوح",
    englishName: "Noah",
    attributes: {
      first_human: false,
      lived_unusually_long: true,        // 950 years per Qur'an 29:14
      lived_before_ibrahim: true,
      last_prophet: false,
      was_descendant_of_ibrahim: false,
      had_brother_who_was_also_prophet: false,
      had_son_who_became_prophet: false,
      was_father_of_a_prophet: false,
      one_of_ulu_al_azm: true,
      received_major_book: false,
      received_quran: false,
      sent_to_arabia: false,
      sent_to_bani_israel: false,
      lived_in_arabia: false,
      lived_in_egypt: false,
      lived_in_palestine_or_levant: false,
      built_an_ark: true,
      was_thrown_into_fire: false,
      was_swallowed_by_whale: false,
      spoke_to_allah_directly: null,
      stick_became_snake: false,
      could_command_jinn: false,
      could_understand_animals: false,
      was_born_without_father: false,
      was_taken_up_alive: false,
      was_a_king: false,
      was_a_minister_or_high_official: false,
      was_tested_with_severe_illness: false,
    },
  },
  {
    id: "hud",
    name: "Hud",
    nameArabic: "هود",
    englishName: null,
    attributes: {
      first_human: false,
      lived_unusually_long: false,
      lived_before_ibrahim: true,
      last_prophet: false,
      was_descendant_of_ibrahim: false,
      had_brother_who_was_also_prophet: false,
      had_son_who_became_prophet: false,
      was_father_of_a_prophet: false,
      one_of_ulu_al_azm: false,
      received_major_book: false,
      received_quran: false,
      sent_to_arabia: true,              // to the people of 'Ad
      sent_to_bani_israel: false,
      lived_in_arabia: true,
      lived_in_egypt: false,
      lived_in_palestine_or_levant: false,
      built_an_ark: false,
      was_thrown_into_fire: false,
      was_swallowed_by_whale: false,
      spoke_to_allah_directly: null,
      stick_became_snake: false,
      could_command_jinn: false,
      could_understand_animals: false,
      was_born_without_father: false,
      was_taken_up_alive: false,
      was_a_king: false,
      was_a_minister_or_high_official: false,
      was_tested_with_severe_illness: false,
    },
  },
  {
    id: "salih",
    name: "Salih",
    nameArabic: "صالح",
    englishName: null,
    attributes: {
      first_human: false,
      lived_unusually_long: false,
      lived_before_ibrahim: true,
      last_prophet: false,
      was_descendant_of_ibrahim: false,
      had_brother_who_was_also_prophet: false,
      had_son_who_became_prophet: false,
      was_father_of_a_prophet: false,
      one_of_ulu_al_azm: false,
      received_major_book: false,
      received_quran: false,
      sent_to_arabia: true,              // to the people of Thamud
      sent_to_bani_israel: false,
      lived_in_arabia: true,
      lived_in_egypt: false,
      lived_in_palestine_or_levant: false,
      built_an_ark: false,
      was_thrown_into_fire: false,
      was_swallowed_by_whale: false,
      spoke_to_allah_directly: null,
      stick_became_snake: false,
      could_command_jinn: false,
      could_understand_animals: false,
      was_born_without_father: false,
      was_taken_up_alive: false,
      was_a_king: false,
      was_a_minister_or_high_official: false,
      was_tested_with_severe_illness: false,
    },
  },
  {
    id: "ibrahim",
    name: "Ibrahim",
    nameArabic: "إبراهيم",
    englishName: "Abraham",
    attributes: {
      first_human: false,
      lived_unusually_long: false,
      lived_before_ibrahim: false,
      last_prophet: false,
      was_descendant_of_ibrahim: false,
      had_brother_who_was_also_prophet: false,
      had_son_who_became_prophet: true,  // Ismail + Ishaq
      was_father_of_a_prophet: true,
      one_of_ulu_al_azm: true,
      received_major_book: false,        // received suhuf (scrolls), not one of the 4 major
      received_quran: false,
      sent_to_arabia: false,
      sent_to_bani_israel: false,
      lived_in_arabia: false,            // lived in Iraq → Sham → built Ka'bah; complex
      lived_in_egypt: false,
      lived_in_palestine_or_levant: true,
      built_an_ark: false,
      was_thrown_into_fire: true,
      was_swallowed_by_whale: false,
      spoke_to_allah_directly: null,
      stick_became_snake: false,
      could_command_jinn: false,
      could_understand_animals: false,
      was_born_without_father: false,
      was_taken_up_alive: false,
      was_a_king: false,
      was_a_minister_or_high_official: false,
      was_tested_with_severe_illness: false,
    },
  },
  {
    id: "lut",
    name: "Lut",
    nameArabic: "لوط",
    englishName: "Lot",
    attributes: {
      first_human: false,
      lived_unusually_long: false,
      lived_before_ibrahim: false,
      last_prophet: false,
      was_descendant_of_ibrahim: false,  // nephew, not descendant
      had_brother_who_was_also_prophet: false,
      had_son_who_became_prophet: false,
      was_father_of_a_prophet: false,
      one_of_ulu_al_azm: false,
      received_major_book: false,
      received_quran: false,
      sent_to_arabia: false,
      sent_to_bani_israel: false,
      lived_in_arabia: false,
      lived_in_egypt: false,
      lived_in_palestine_or_levant: true,
      built_an_ark: false,
      was_thrown_into_fire: false,
      was_swallowed_by_whale: false,
      spoke_to_allah_directly: null,
      stick_became_snake: false,
      could_command_jinn: false,
      could_understand_animals: false,
      was_born_without_father: false,
      was_taken_up_alive: false,
      was_a_king: false,
      was_a_minister_or_high_official: false,
      was_tested_with_severe_illness: false,
    },
  },
  {
    id: "ismail",
    name: "Ismail",
    nameArabic: "إسماعيل",
    englishName: "Ishmael",
    attributes: {
      first_human: false,
      lived_unusually_long: false,
      lived_before_ibrahim: false,
      last_prophet: false,
      was_descendant_of_ibrahim: true,
      had_brother_who_was_also_prophet: true,  // Ishaq
      had_son_who_became_prophet: false,        // descendants include Muhammad ﷺ but not direct son
      was_father_of_a_prophet: false,           // TODO verify: depends on definition
      one_of_ulu_al_azm: false,
      received_major_book: false,
      received_quran: false,
      sent_to_arabia: true,
      sent_to_bani_israel: false,
      lived_in_arabia: true,             // settled in Makkah
      lived_in_egypt: false,
      lived_in_palestine_or_levant: false,
      built_an_ark: false,
      was_thrown_into_fire: false,
      was_swallowed_by_whale: false,
      spoke_to_allah_directly: null,
      stick_became_snake: false,
      could_command_jinn: false,
      could_understand_animals: false,
      was_born_without_father: false,
      was_taken_up_alive: false,
      was_a_king: false,
      was_a_minister_or_high_official: false,
      was_tested_with_severe_illness: false,
    },
  },
  {
    id: "ishaq",
    name: "Ishaq",
    nameArabic: "إسحاق",
    englishName: "Isaac",
    attributes: {
      first_human: false,
      lived_unusually_long: false,
      lived_before_ibrahim: false,
      last_prophet: false,
      was_descendant_of_ibrahim: true,
      had_brother_who_was_also_prophet: true,  // Ismail
      had_son_who_became_prophet: true,         // Yaqub
      was_father_of_a_prophet: true,
      one_of_ulu_al_azm: false,
      received_major_book: false,
      received_quran: false,
      sent_to_arabia: false,
      sent_to_bani_israel: false,        // pre-existed Bani Israel
      lived_in_arabia: false,
      lived_in_egypt: false,
      lived_in_palestine_or_levant: true,
      built_an_ark: false,
      was_thrown_into_fire: false,
      was_swallowed_by_whale: false,
      spoke_to_allah_directly: null,
      stick_became_snake: false,
      could_command_jinn: false,
      could_understand_animals: false,
      was_born_without_father: false,
      was_taken_up_alive: false,
      was_a_king: false,
      was_a_minister_or_high_official: false,
      was_tested_with_severe_illness: false,
    },
  },
  {
    id: "yaqub",
    name: "Yaqub",
    nameArabic: "يعقوب",
    englishName: "Jacob",
    attributes: {
      first_human: false,
      lived_unusually_long: false,
      lived_before_ibrahim: false,
      last_prophet: false,
      was_descendant_of_ibrahim: true,
      had_brother_who_was_also_prophet: false,
      had_son_who_became_prophet: true,  // Yusuf
      was_father_of_a_prophet: true,
      one_of_ulu_al_azm: false,
      received_major_book: false,
      received_quran: false,
      sent_to_arabia: false,
      sent_to_bani_israel: null,         // TODO verify: was the patriarch (Israel), but sent-to relationship is different
      lived_in_arabia: false,
      lived_in_egypt: false,             // moved to Egypt later in life
      lived_in_palestine_or_levant: true,
      built_an_ark: false,
      was_thrown_into_fire: false,
      was_swallowed_by_whale: false,
      spoke_to_allah_directly: null,
      stick_became_snake: false,
      could_command_jinn: false,
      could_understand_animals: false,
      was_born_without_father: false,
      was_taken_up_alive: false,
      was_a_king: false,
      was_a_minister_or_high_official: false,
      was_tested_with_severe_illness: false,
    },
  },
  {
    id: "yusuf",
    name: "Yusuf",
    nameArabic: "يوسف",
    englishName: "Joseph",
    attributes: {
      first_human: false,
      lived_unusually_long: false,
      lived_before_ibrahim: false,
      last_prophet: false,
      was_descendant_of_ibrahim: true,
      had_brother_who_was_also_prophet: false,
      had_son_who_became_prophet: false,
      was_father_of_a_prophet: false,
      one_of_ulu_al_azm: false,
      received_major_book: false,
      received_quran: false,
      sent_to_arabia: false,
      sent_to_bani_israel: null,
      lived_in_arabia: false,
      lived_in_egypt: true,
      lived_in_palestine_or_levant: true, // born there, lived in Egypt
      built_an_ark: false,
      was_thrown_into_fire: false,
      was_swallowed_by_whale: false,
      spoke_to_allah_directly: null,
      stick_became_snake: false,
      could_command_jinn: false,
      could_understand_animals: false,
      was_born_without_father: false,
      was_taken_up_alive: false,
      was_a_king: false,
      was_a_minister_or_high_official: true, // Aziz / treasury of Egypt
      was_tested_with_severe_illness: false,
    },
  },
  {
    id: "ayyub",
    name: "Ayyub",
    nameArabic: "أيوب",
    englishName: "Job",
    attributes: {
      first_human: false,
      lived_unusually_long: false,
      lived_before_ibrahim: false,       // post-Ibrahim per most traditions
      last_prophet: false,
      was_descendant_of_ibrahim: true,   // descendant per common tradition
      had_brother_who_was_also_prophet: false,
      had_son_who_became_prophet: false,
      was_father_of_a_prophet: false,
      one_of_ulu_al_azm: false,
      received_major_book: false,
      received_quran: false,
      sent_to_arabia: false,
      sent_to_bani_israel: false,
      lived_in_arabia: false,
      lived_in_egypt: false,
      lived_in_palestine_or_levant: true,
      built_an_ark: false,
      was_thrown_into_fire: false,
      was_swallowed_by_whale: false,
      spoke_to_allah_directly: null,
      stick_became_snake: false,
      could_command_jinn: false,
      could_understand_animals: false,
      was_born_without_father: false,
      was_taken_up_alive: false,
      was_a_king: false,
      was_a_minister_or_high_official: false,
      was_tested_with_severe_illness: true,  // famous for sabr through illness
    },
  },
  {
    id: "shuayb",
    name: "Shuayb",
    nameArabic: "شعيب",
    englishName: "Jethro",
    attributes: {
      first_human: false,
      lived_unusually_long: false,
      lived_before_ibrahim: false,
      last_prophet: false,
      was_descendant_of_ibrahim: null,   // TODO verify
      had_brother_who_was_also_prophet: false,
      had_son_who_became_prophet: false,
      was_father_of_a_prophet: false,
      one_of_ulu_al_azm: false,
      received_major_book: false,
      received_quran: false,
      sent_to_arabia: false,             // to Madyan
      sent_to_bani_israel: false,
      lived_in_arabia: null,             // Madyan ~northwest Arabia depending on definition
      lived_in_egypt: false,
      lived_in_palestine_or_levant: false,
      built_an_ark: false,
      was_thrown_into_fire: false,
      was_swallowed_by_whale: false,
      spoke_to_allah_directly: null,
      stick_became_snake: false,
      could_command_jinn: false,
      could_understand_animals: false,
      was_born_without_father: false,
      was_taken_up_alive: false,
      was_a_king: false,
      was_a_minister_or_high_official: false,
      was_tested_with_severe_illness: false,
    },
  },
  {
    id: "musa",
    name: "Musa",
    nameArabic: "موسى",
    englishName: "Moses",
    attributes: {
      first_human: false,
      lived_unusually_long: false,
      lived_before_ibrahim: false,
      last_prophet: false,
      was_descendant_of_ibrahim: true,
      had_brother_who_was_also_prophet: true,  // Harun
      had_son_who_became_prophet: false,
      was_father_of_a_prophet: false,
      one_of_ulu_al_azm: true,
      received_major_book: true,          // Tawrah
      received_quran: false,
      sent_to_arabia: false,
      sent_to_bani_israel: true,
      lived_in_arabia: false,
      lived_in_egypt: true,
      lived_in_palestine_or_levant: false,
      built_an_ark: false,
      was_thrown_into_fire: false,
      was_swallowed_by_whale: false,
      spoke_to_allah_directly: true,      // Kalim Allah
      stick_became_snake: true,
      could_command_jinn: false,
      could_understand_animals: false,
      was_born_without_father: false,
      was_taken_up_alive: false,
      was_a_king: false,
      was_a_minister_or_high_official: false,
      was_tested_with_severe_illness: false,
    },
  },
  {
    id: "harun",
    name: "Harun",
    nameArabic: "هارون",
    englishName: "Aaron",
    attributes: {
      first_human: false,
      lived_unusually_long: false,
      lived_before_ibrahim: false,
      last_prophet: false,
      was_descendant_of_ibrahim: true,
      had_brother_who_was_also_prophet: true, // Musa
      had_son_who_became_prophet: false,
      was_father_of_a_prophet: false,
      one_of_ulu_al_azm: false,
      received_major_book: false,        // assisted Musa, didn't receive own book
      received_quran: false,
      sent_to_arabia: false,
      sent_to_bani_israel: true,
      lived_in_arabia: false,
      lived_in_egypt: true,
      lived_in_palestine_or_levant: false,
      built_an_ark: false,
      was_thrown_into_fire: false,
      was_swallowed_by_whale: false,
      spoke_to_allah_directly: null,
      stick_became_snake: false,
      could_command_jinn: false,
      could_understand_animals: false,
      was_born_without_father: false,
      was_taken_up_alive: false,
      was_a_king: false,
      was_a_minister_or_high_official: false,
      was_tested_with_severe_illness: false,
    },
  },
  {
    id: "dhul-kifl",
    name: "Dhul-Kifl",
    nameArabic: "ذو الكفل",
    englishName: null,
    attributes: {
      first_human: false,
      lived_unusually_long: false,
      lived_before_ibrahim: null,
      last_prophet: false,
      was_descendant_of_ibrahim: null,   // TODO verify
      had_brother_who_was_also_prophet: false,
      had_son_who_became_prophet: false,
      was_father_of_a_prophet: false,
      one_of_ulu_al_azm: false,
      received_major_book: false,
      received_quran: false,
      sent_to_arabia: false,
      sent_to_bani_israel: null,
      lived_in_arabia: false,
      lived_in_egypt: false,
      lived_in_palestine_or_levant: null,
      built_an_ark: false,
      was_thrown_into_fire: false,
      was_swallowed_by_whale: false,
      spoke_to_allah_directly: null,
      stick_became_snake: false,
      could_command_jinn: false,
      could_understand_animals: false,
      was_born_without_father: false,
      was_taken_up_alive: false,
      was_a_king: false,
      was_a_minister_or_high_official: false,
      was_tested_with_severe_illness: false,
    },
  },
  {
    id: "dawud",
    name: "Dawud",
    nameArabic: "داود",
    englishName: "David",
    attributes: {
      first_human: false,
      lived_unusually_long: false,
      lived_before_ibrahim: false,
      last_prophet: false,
      was_descendant_of_ibrahim: true,
      had_brother_who_was_also_prophet: false,
      had_son_who_became_prophet: true,  // Sulayman
      was_father_of_a_prophet: true,
      one_of_ulu_al_azm: false,
      received_major_book: true,         // Zaboor
      received_quran: false,
      sent_to_arabia: false,
      sent_to_bani_israel: true,
      lived_in_arabia: false,
      lived_in_egypt: false,
      lived_in_palestine_or_levant: true,
      built_an_ark: false,
      was_thrown_into_fire: false,
      was_swallowed_by_whale: false,
      spoke_to_allah_directly: null,
      stick_became_snake: false,
      could_command_jinn: false,
      could_understand_animals: null,    // mountains glorified with him; birds too — TODO verify
      was_born_without_father: false,
      was_taken_up_alive: false,
      was_a_king: true,
      was_a_minister_or_high_official: false,
      was_tested_with_severe_illness: false,
    },
  },
  {
    id: "sulayman",
    name: "Sulayman",
    nameArabic: "سليمان",
    englishName: "Solomon",
    attributes: {
      first_human: false,
      lived_unusually_long: false,
      lived_before_ibrahim: false,
      last_prophet: false,
      was_descendant_of_ibrahim: true,
      had_brother_who_was_also_prophet: false,
      had_son_who_became_prophet: false,
      was_father_of_a_prophet: false,
      one_of_ulu_al_azm: false,
      received_major_book: false,        // inherited from Dawud per common understanding
      received_quran: false,
      sent_to_arabia: false,
      sent_to_bani_israel: true,
      lived_in_arabia: false,
      lived_in_egypt: false,
      lived_in_palestine_or_levant: true,
      built_an_ark: false,
      was_thrown_into_fire: false,
      was_swallowed_by_whale: false,
      spoke_to_allah_directly: null,
      stick_became_snake: false,
      could_command_jinn: true,
      could_understand_animals: true,    // ants, hoopoe
      was_born_without_father: false,
      was_taken_up_alive: false,
      was_a_king: true,
      was_a_minister_or_high_official: false,
      was_tested_with_severe_illness: false,
    },
  },
  {
    id: "ilyas",
    name: "Ilyas",
    nameArabic: "إلياس",
    englishName: "Elijah",
    attributes: {
      first_human: false,
      lived_unusually_long: false,
      lived_before_ibrahim: false,
      last_prophet: false,
      was_descendant_of_ibrahim: true,
      had_brother_who_was_also_prophet: false,
      had_son_who_became_prophet: false,
      was_father_of_a_prophet: false,
      one_of_ulu_al_azm: false,
      received_major_book: false,
      received_quran: false,
      sent_to_arabia: false,
      sent_to_bani_israel: true,
      lived_in_arabia: false,
      lived_in_egypt: false,
      lived_in_palestine_or_levant: true,
      built_an_ark: false,
      was_thrown_into_fire: false,
      was_swallowed_by_whale: false,
      spoke_to_allah_directly: null,
      stick_became_snake: false,
      could_command_jinn: false,
      could_understand_animals: false,
      was_born_without_father: false,
      was_taken_up_alive: false,
      was_a_king: false,
      was_a_minister_or_high_official: false,
      was_tested_with_severe_illness: false,
    },
  },
  {
    id: "al-yasa",
    name: "Al-Yasa",
    nameArabic: "اليسع",
    englishName: "Elisha",
    attributes: {
      first_human: false,
      lived_unusually_long: false,
      lived_before_ibrahim: false,
      last_prophet: false,
      was_descendant_of_ibrahim: true,
      had_brother_who_was_also_prophet: false,
      had_son_who_became_prophet: false,
      was_father_of_a_prophet: false,
      one_of_ulu_al_azm: false,
      received_major_book: false,
      received_quran: false,
      sent_to_arabia: false,
      sent_to_bani_israel: true,
      lived_in_arabia: false,
      lived_in_egypt: false,
      lived_in_palestine_or_levant: true,
      built_an_ark: false,
      was_thrown_into_fire: false,
      was_swallowed_by_whale: false,
      spoke_to_allah_directly: null,
      stick_became_snake: false,
      could_command_jinn: false,
      could_understand_animals: false,
      was_born_without_father: false,
      was_taken_up_alive: false,
      was_a_king: false,
      was_a_minister_or_high_official: false,
      was_tested_with_severe_illness: false,
    },
  },
  {
    id: "yunus",
    name: "Yunus",
    nameArabic: "يونس",
    englishName: "Jonah",
    attributes: {
      first_human: false,
      lived_unusually_long: false,
      lived_before_ibrahim: false,
      last_prophet: false,
      was_descendant_of_ibrahim: null,   // TODO verify
      had_brother_who_was_also_prophet: false,
      had_son_who_became_prophet: false,
      was_father_of_a_prophet: false,
      one_of_ulu_al_azm: false,
      received_major_book: false,
      received_quran: false,
      sent_to_arabia: false,
      sent_to_bani_israel: false,        // sent to Nineveh (people of Yunus)
      lived_in_arabia: false,
      lived_in_egypt: false,
      lived_in_palestine_or_levant: false,
      built_an_ark: false,
      was_thrown_into_fire: false,
      was_swallowed_by_whale: true,
      spoke_to_allah_directly: null,
      stick_became_snake: false,
      could_command_jinn: false,
      could_understand_animals: false,
      was_born_without_father: false,
      was_taken_up_alive: false,
      was_a_king: false,
      was_a_minister_or_high_official: false,
      was_tested_with_severe_illness: false,
    },
  },
  {
    id: "zakariya",
    name: "Zakariya",
    nameArabic: "زكريا",
    englishName: "Zechariah",
    attributes: {
      first_human: false,
      lived_unusually_long: true,        // had Yahya in old age per Qur'an
      lived_before_ibrahim: false,
      last_prophet: false,
      was_descendant_of_ibrahim: true,
      had_brother_who_was_also_prophet: false,
      had_son_who_became_prophet: true,  // Yahya
      was_father_of_a_prophet: true,
      one_of_ulu_al_azm: false,
      received_major_book: false,
      received_quran: false,
      sent_to_arabia: false,
      sent_to_bani_israel: true,
      lived_in_arabia: false,
      lived_in_egypt: false,
      lived_in_palestine_or_levant: true,
      built_an_ark: false,
      was_thrown_into_fire: false,
      was_swallowed_by_whale: false,
      spoke_to_allah_directly: null,
      stick_became_snake: false,
      could_command_jinn: false,
      could_understand_animals: false,
      was_born_without_father: false,
      was_taken_up_alive: false,
      was_a_king: false,
      was_a_minister_or_high_official: false,
      was_tested_with_severe_illness: false,
    },
  },
  {
    id: "yahya",
    name: "Yahya",
    nameArabic: "يحيى",
    englishName: "John",
    attributes: {
      first_human: false,
      lived_unusually_long: false,
      lived_before_ibrahim: false,
      last_prophet: false,
      was_descendant_of_ibrahim: true,
      had_brother_who_was_also_prophet: false,
      had_son_who_became_prophet: false,
      was_father_of_a_prophet: false,
      one_of_ulu_al_azm: false,
      received_major_book: false,
      received_quran: false,
      sent_to_arabia: false,
      sent_to_bani_israel: true,
      lived_in_arabia: false,
      lived_in_egypt: false,
      lived_in_palestine_or_levant: true,
      built_an_ark: false,
      was_thrown_into_fire: false,
      was_swallowed_by_whale: false,
      spoke_to_allah_directly: null,
      stick_became_snake: false,
      could_command_jinn: false,
      could_understand_animals: false,
      was_born_without_father: false,
      was_taken_up_alive: false,
      was_a_king: false,
      was_a_minister_or_high_official: false,
      was_tested_with_severe_illness: false,
    },
  },
  {
    id: "isa",
    name: "Isa",
    nameArabic: "عيسى",
    englishName: "Jesus",
    attributes: {
      first_human: false,
      lived_unusually_long: false,
      lived_before_ibrahim: false,
      last_prophet: false,
      was_descendant_of_ibrahim: true,
      had_brother_who_was_also_prophet: false,
      had_son_who_became_prophet: false,
      was_father_of_a_prophet: false,
      one_of_ulu_al_azm: true,
      received_major_book: true,         // Injil
      received_quran: false,
      sent_to_arabia: false,
      sent_to_bani_israel: true,
      lived_in_arabia: false,
      lived_in_egypt: false,
      lived_in_palestine_or_levant: true,
      built_an_ark: false,
      was_thrown_into_fire: false,
      was_swallowed_by_whale: false,
      spoke_to_allah_directly: null,
      stick_became_snake: false,
      could_command_jinn: false,
      could_understand_animals: false,
      was_born_without_father: true,
      was_taken_up_alive: true,           // Qur'an 4:158
      was_a_king: false,
      was_a_minister_or_high_official: false,
      was_tested_with_severe_illness: false,
    },
  },
  {
    id: "muhammad",
    name: "Muhammad ﷺ",
    nameArabic: "محمد ﷺ",
    englishName: "Muhammad",
    attributes: {
      first_human: false,
      lived_unusually_long: false,
      lived_before_ibrahim: false,
      last_prophet: true,
      was_descendant_of_ibrahim: true,
      had_brother_who_was_also_prophet: false,
      had_son_who_became_prophet: false,
      was_father_of_a_prophet: false,
      one_of_ulu_al_azm: true,
      received_major_book: true,         // Qur'an
      received_quran: true,
      sent_to_arabia: true,
      sent_to_bani_israel: false,         // Quraysh primarily; ultimately to all humanity
      lived_in_arabia: true,
      lived_in_egypt: false,
      lived_in_palestine_or_levant: false,
      built_an_ark: false,
      was_thrown_into_fire: false,
      was_swallowed_by_whale: false,
      spoke_to_allah_directly: null,     // Mi'raj — TODO consider with care
      stick_became_snake: false,
      could_command_jinn: false,
      could_understand_animals: false,
      was_born_without_father: false,    // father Abdullah died before birth — TODO verify intent
      was_taken_up_alive: false,
      was_a_king: false,
      was_a_minister_or_high_official: false,
      was_tested_with_severe_illness: false,
    },
  },
];

// =============================================================================
// QUESTIONS — what kids tap to ask. Each maps to one attribute.
// =============================================================================
export interface QuestionRecord {
  id: string;
  text: string;
  attribute: string;
  category: QuestionCategory;
}

export type QuestionCategory = "era" | "family" | "mission" | "location" | "miracles" | "other";

export const QUESTION_CATEGORIES: { id: QuestionCategory; label: string; emoji: string }[] = [
  { id: "era",       label: "When?",      emoji: "🕰️" },
  { id: "location",  label: "Where?",     emoji: "🗺️" },
  { id: "family",    label: "Family",     emoji: "👨‍👩‍👧‍👦" },
  { id: "mission",   label: "Mission",    emoji: "📖" },
  { id: "miracles",  label: "Miracles",   emoji: "✨" },
  { id: "other",     label: "Other",      emoji: "❓" },
];

export const QUESTIONS: QuestionRecord[] = [
  // Era
  { id: "q-first-human",        text: "Was this Prophet the first human?",                                attribute: "first_human",            category: "era" },
  { id: "q-lived-long",         text: "Did this Prophet live an unusually long life?",                    attribute: "lived_unusually_long",   category: "era" },
  { id: "q-before-ibrahim",     text: "Did this Prophet live before Prophet Ibrahim (Abraham)?",          attribute: "lived_before_ibrahim",   category: "era" },
  { id: "q-last-prophet",       text: "Was this Prophet the last and final Prophet?",                     attribute: "last_prophet",           category: "era" },

  // Family
  { id: "q-descendant-ibrahim", text: "Was this Prophet a descendant of Ibrahim (Abraham)?",              attribute: "was_descendant_of_ibrahim", category: "family" },
  { id: "q-brother-prophet",    text: "Did this Prophet have a brother who was also a Prophet?",          attribute: "had_brother_who_was_also_prophet", category: "family" },
  { id: "q-son-prophet",        text: "Did this Prophet have a son who became a Prophet?",                attribute: "had_son_who_became_prophet", category: "family" },
  { id: "q-father-of-prophet",  text: "Was this Prophet the father of another Prophet?",                  attribute: "was_father_of_a_prophet", category: "family" },

  // Mission
  { id: "q-ulu-al-azm",         text: "Was this Prophet one of the 5 great messengers (Ulu Al-Azm)?",     attribute: "one_of_ulu_al_azm",      category: "mission" },
  { id: "q-major-book",         text: "Did this Prophet receive a major scripture (Tawrah, Zaboor, Injil, or Qur'an)?", attribute: "received_major_book", category: "mission" },
  { id: "q-quran",              text: "Did this Prophet receive the Qur'an?",                             attribute: "received_quran",         category: "mission" },
  { id: "q-arabia-sent",        text: "Was this Prophet sent to people living in Arabia?",                attribute: "sent_to_arabia",         category: "mission" },
  { id: "q-bani-israel",        text: "Was this Prophet sent to Bani Israel (the Children of Israel)?",   attribute: "sent_to_bani_israel",    category: "mission" },

  // Location
  { id: "q-lived-arabia",       text: "Did this Prophet live in Arabia?",                                  attribute: "lived_in_arabia",        category: "location" },
  { id: "q-lived-egypt",        text: "Did this Prophet live in Egypt?",                                   attribute: "lived_in_egypt",         category: "location" },
  { id: "q-lived-levant",       text: "Did this Prophet live in Palestine or the Levant area?",            attribute: "lived_in_palestine_or_levant", category: "location" },

  // Miracles
  { id: "q-ark",                text: "Did this Prophet build a great ark?",                              attribute: "built_an_ark",           category: "miracles" },
  { id: "q-fire",               text: "Was this Prophet thrown into a fire and saved by Allah?",          attribute: "was_thrown_into_fire",   category: "miracles" },
  { id: "q-whale",              text: "Was this Prophet swallowed by a whale (great fish)?",              attribute: "was_swallowed_by_whale", category: "miracles" },
  { id: "q-spoke-allah",        text: "Did Allah speak to this Prophet directly?",                        attribute: "spoke_to_allah_directly", category: "miracles" },
  { id: "q-stick-snake",        text: "Did this Prophet's stick turn into a snake?",                      attribute: "stick_became_snake",     category: "miracles" },
  { id: "q-jinn",               text: "Could this Prophet command jinn?",                                 attribute: "could_command_jinn",     category: "miracles" },
  { id: "q-animals",            text: "Could this Prophet understand the speech of animals?",             attribute: "could_understand_animals", category: "miracles" },
  { id: "q-no-father",          text: "Was this Prophet born without a father?",                          attribute: "was_born_without_father", category: "miracles" },
  { id: "q-taken-up",           text: "Was this Prophet taken up alive (not having died)?",               attribute: "was_taken_up_alive",     category: "miracles" },

  // Other
  { id: "q-king",               text: "Was this Prophet a king?",                                          attribute: "was_a_king",             category: "other" },
  { id: "q-minister",           text: "Was this Prophet a minister or high official?",                    attribute: "was_a_minister_or_high_official", category: "other" },
  { id: "q-illness",            text: "Was this Prophet tested with a severe illness?",                   attribute: "was_tested_with_severe_illness", category: "other" },

  // ─── Added in v2 to better distinguish less-prominent Prophets ───
  // Family
  { id: "q-nephew-ibrahim",     text: "Was this Prophet a nephew of Prophet Ibrahim?",                    attribute: "nephew_of_ibrahim",      category: "family" },
  // Mission — specific peoples
  { id: "q-sent-madyan",        text: "Was this Prophet sent to the people of Madyan?",                   attribute: "sent_to_madyan",         category: "mission" },
  { id: "q-sent-ad",            text: "Was this Prophet sent to the people of 'Ad?",                      attribute: "sent_to_ad",             category: "mission" },
  { id: "q-sent-thamud",        text: "Was this Prophet sent to the people of Thamud?",                   attribute: "sent_to_thamud",         category: "mission" },
  // Miracles & marked events
  { id: "q-dreams",             text: "Could this Prophet interpret dreams?",                             attribute: "interpreted_dreams",     category: "miracles" },
  { id: "q-built-kaaba",        text: "Did this Prophet help build the Ka'bah in Makkah?",                attribute: "built_kaaba",            category: "miracles" },
  { id: "q-cured-revived",      text: "Could this Prophet, by Allah's permission, heal the sick or revive the dead?", attribute: "cured_sick_or_revived_dead", category: "miracles" },
  // Other — unique markers
  { id: "q-unique-name",        text: "Did Allah give this Prophet a name no one had been given before?", attribute: "had_a_unique_name_never_given_before", category: "other" },

  // ─── Added in v3 — contemporaries + Quran-surah questions ───
  // Era — contemporaries are powerful narrowers (a single yes/no usually
  // collapses the candidate set by half).
  { id: "q-contemp-ibrahim",    text: "Did this Prophet live during the lifetime of Prophet Ibrahim?",    attribute: "contemporary_of_ibrahim", category: "era" },
  { id: "q-contemp-musa",       text: "Did this Prophet live during the lifetime of Prophet Musa?",       attribute: "contemporary_of_musa",    category: "era" },
  { id: "q-contemp-dawud",      text: "Did this Prophet live during the lifetime of Prophet Dawud?",      attribute: "contemporary_of_dawud",   category: "era" },
  // Other — is there a Qur'an chapter named after this Prophet?
  { id: "q-surah-named",        text: "Is there a chapter (Surah) of the Qur'an named after this Prophet?", attribute: "has_surah_named_after_him", category: "other" },
];

// =============================================================================
// Kid-friendly Prophet descriptions
// =============================================================================
// Shown at the end of every round so the kid learns something even when
// they didn't guess correctly. 2-3 sentences, age 6-10 reading level.
//
// IMPORTANT — REVIEW BEFORE PRODUCTION:
//   These descriptions were drafted by an AI based on mainstream Sunni
//   understanding rooted in the Qur'an (primary) and traditional
//   commentary. Muneeb MUST verify each against an authoritative source
//   (Tafsir Ibn Kathir's "Stories of the Prophets", Maariful Quran, or
//   a qualified scholar) before this ships to real kids. If a line
//   isn't directly Quranic, the safer move at review time is to cut it.
//
// Style guide for any future edits:
//   - 2-3 sentences, plain language, no technical theology.
//   - When possible, anchor with a specific Quranic detail.
//   - Use "Allah" not "God"; transliterate Arabic names consistently
//     (Nuh, Ibrahim, Musa, 'Isa, Muhammad ﷺ).
//   - Avoid graphic detail for kids (e.g. Lut's people: say "wrong
//     actions" not specifics).
// =============================================================================
const PROPHET_DESCRIPTIONS: Record<string, string> = {
  adam:
    "The first human Allah created. Allah taught him the names of all things and made the angels honor him. He and his wife Hawwa lived in Jannah, and after coming to earth, Adam was the first Prophet.",
  idris:
    "A patient and truthful Prophet who lived very long ago, before Nuh. The Qur'an tells us Allah raised him to a high place. He is praised in the Qur'an for his honesty.",
  nuh:
    "A great Prophet who called his people to worship only Allah for many, many years. When most refused, Allah told him to build a huge ark. He took his family and pairs of every animal, and a great flood saved the believers.",
  hud:
    "A Prophet sent to the people of 'Ad in Arabia. The 'Ad were tall and strong, but they were proud and worshipped idols. They refused his message, and Allah destroyed them with a powerful wind.",
  salih:
    "A Prophet sent to the people of Thamud in Arabia. They asked him for a sign, so Allah brought a special she-camel out of a rock. When they harmed the camel, a great noise destroyed them.",
  ibrahim:
    "Allah called him 'Khalil' — His close friend. He smashed his people's idols, and the king threw him into a great fire, but Allah made it cool and safe. He built the Ka'bah in Makkah with his son Isma'il.",
  lut:
    "The nephew of Prophet Ibrahim. He warned his people about their very wrong actions, but they would not listen. Allah saved Lut and the believers, then destroyed the cities with stones from the sky.",
  ismail:
    "The first son of Prophet Ibrahim. As a young boy he was patient when Allah asked Ibrahim to sacrifice him — and Allah replaced him with a ram. He helped his father build the Ka'bah in Makkah.",
  ishaq:
    "The son of Prophet Ibrahim and Sarah, born when his parents were old — a gift from Allah. He grew up to be a Prophet like his father, and his son Ya'qub also became a Prophet.",
  yaqub:
    "Also called Israel — the Bani Israel are his descendants. He was the father of Yusuf and eleven other sons. He cried so much when he lost Yusuf that his eyes grew weak, and Allah gave back his sight when Yusuf was found.",
  yusuf:
    "The son of Ya'qub. His brothers were jealous and put him in a well. He was sold as a slave, then put in prison, but Allah gave him wisdom — he could understand dreams. He became a minister of Egypt and saved many people from hunger.",
  ayyub:
    "A wealthy and pious Prophet. Allah tested him with a long, hard illness and the loss of his family and wealth. He was patient and kept praising Allah, and Allah healed him and gave him more than he had before.",
  shuayb:
    "A Prophet sent to the people of Madyan. They cheated others when buying and selling — using small weights and measures. Shuayb told them to be honest, but they would not listen, and Allah punished them.",
  musa:
    "Allah spoke directly with him at the mountain — he is called 'Kalim Allah'. He freed the Bani Israel from Fir'awn, and Allah parted the sea for them. He received the Tawrah from Allah.",
  harun:
    "The older brother of Musa. He had a clear and beautiful way of speaking. Musa asked Allah to send Harun as a helper, and Allah made Harun a Prophet too.",
  "dhul-kifl":
    "Allah praises him in the Qur'an as patient, righteous and from the chosen ones. The Qur'an does not tell us much about his story, but he was a noble and just Prophet.",
  dawud:
    "Allah made him a king and gave him the Zaboor. He had such a beautiful voice that the mountains and the birds would praise Allah with him. Allah softened iron in his hands so he could shape it.",
  sulayman:
    "The son of Dawud. Allah gave him a great kingdom — he could command jinn, and he understood the speech of birds and ants. He was a wise judge and worshipped Allah with humility.",
  ilyas:
    "A Prophet sent to people who worshipped a false god called Ba'l instead of Allah. He called them back to the One God and warned them to leave their idols.",
  "al-yasa":
    "He came after Prophet Ilyas to continue calling people to worship Allah alone. The Qur'an names him among the chosen and excellent Prophets.",
  yunus:
    "Sent to the people of Ninwa. When they refused his message he left, but Allah was not pleased. A great fish swallowed him. In the dark belly of the fish he made tasbih and turned to Allah, and Allah saved him.",
  zakariya:
    "A pious old Prophet who took care of Maryam. He was sad that he had no son, and he prayed quietly to Allah at night. Allah answered him and gave him Yahya.",
  yahya:
    "The son of Zakariya. Allah said about him: 'We never gave this name to anyone before him.' Allah described him as wise and pure from childhood — a Prophet from a young age.",
  isa:
    "Born to Maryam without a father, by Allah's command. He spoke as a baby in the cradle to defend his mother. With Allah's permission he healed the blind, healed lepers, and brought the dead back to life. He received the Injil, and Allah raised him up to the heavens.",
  muhammad:
    "The final Prophet, sent to all of humanity. Allah revealed the Qur'an to him through the angel Jibril. His beautiful character and his teachings showed the whole world the best way to live and worship Allah.",
};

// =============================================================================
// Extra attributes — added in v2 of the game to better distinguish less-
// prominent Prophets (Idris, Lut, Shuayb, Hud, Salih, Yunus, Yusuf, Isa,
// Yahya). Merged into each Prophet's attributes at module init.
// =============================================================================
const PROPHET_EXTRA_ATTRIBUTES: Record<string, Record<string, boolean | null>> = {
  adam:      { nephew_of_ibrahim: false, sent_to_madyan: false, sent_to_ad: false, sent_to_thamud: false, interpreted_dreams: false, built_kaaba: false, cured_sick_or_revived_dead: false, had_a_unique_name_never_given_before: false },
  idris:     { nephew_of_ibrahim: false, sent_to_madyan: false, sent_to_ad: false, sent_to_thamud: false, interpreted_dreams: false, built_kaaba: false, cured_sick_or_revived_dead: false, had_a_unique_name_never_given_before: false },
  nuh:       { nephew_of_ibrahim: false, sent_to_madyan: false, sent_to_ad: false, sent_to_thamud: false, interpreted_dreams: false, built_kaaba: false, cured_sick_or_revived_dead: false, had_a_unique_name_never_given_before: false },
  hud:       { nephew_of_ibrahim: false, sent_to_madyan: false, sent_to_ad: true,  sent_to_thamud: false, interpreted_dreams: false, built_kaaba: false, cured_sick_or_revived_dead: false, had_a_unique_name_never_given_before: false },
  salih:     { nephew_of_ibrahim: false, sent_to_madyan: false, sent_to_ad: false, sent_to_thamud: true,  interpreted_dreams: false, built_kaaba: false, cured_sick_or_revived_dead: false, had_a_unique_name_never_given_before: false },
  ibrahim:   { nephew_of_ibrahim: false, sent_to_madyan: false, sent_to_ad: false, sent_to_thamud: false, interpreted_dreams: false, built_kaaba: true,  cured_sick_or_revived_dead: false, had_a_unique_name_never_given_before: false },
  lut:       { nephew_of_ibrahim: true,  sent_to_madyan: false, sent_to_ad: false, sent_to_thamud: false, interpreted_dreams: false, built_kaaba: false, cured_sick_or_revived_dead: false, had_a_unique_name_never_given_before: false },
  ismail:    { nephew_of_ibrahim: false, sent_to_madyan: false, sent_to_ad: false, sent_to_thamud: false, interpreted_dreams: false, built_kaaba: true,  cured_sick_or_revived_dead: false, had_a_unique_name_never_given_before: false },
  ishaq:     { nephew_of_ibrahim: false, sent_to_madyan: false, sent_to_ad: false, sent_to_thamud: false, interpreted_dreams: false, built_kaaba: false, cured_sick_or_revived_dead: false, had_a_unique_name_never_given_before: false },
  yaqub:     { nephew_of_ibrahim: false, sent_to_madyan: false, sent_to_ad: false, sent_to_thamud: false, interpreted_dreams: false, built_kaaba: false, cured_sick_or_revived_dead: false, had_a_unique_name_never_given_before: false },
  yusuf:     { nephew_of_ibrahim: false, sent_to_madyan: false, sent_to_ad: false, sent_to_thamud: false, interpreted_dreams: true,  built_kaaba: false, cured_sick_or_revived_dead: false, had_a_unique_name_never_given_before: false },
  ayyub:     { nephew_of_ibrahim: false, sent_to_madyan: false, sent_to_ad: false, sent_to_thamud: false, interpreted_dreams: false, built_kaaba: false, cured_sick_or_revived_dead: false, had_a_unique_name_never_given_before: false },
  shuayb:    { nephew_of_ibrahim: false, sent_to_madyan: true,  sent_to_ad: false, sent_to_thamud: false, interpreted_dreams: false, built_kaaba: false, cured_sick_or_revived_dead: false, had_a_unique_name_never_given_before: false },
  musa:      { nephew_of_ibrahim: false, sent_to_madyan: false, sent_to_ad: false, sent_to_thamud: false, interpreted_dreams: false, built_kaaba: false, cured_sick_or_revived_dead: false, had_a_unique_name_never_given_before: false },
  harun:     { nephew_of_ibrahim: false, sent_to_madyan: false, sent_to_ad: false, sent_to_thamud: false, interpreted_dreams: false, built_kaaba: false, cured_sick_or_revived_dead: false, had_a_unique_name_never_given_before: false },
  "dhul-kifl": { nephew_of_ibrahim: false, sent_to_madyan: false, sent_to_ad: false, sent_to_thamud: false, interpreted_dreams: false, built_kaaba: false, cured_sick_or_revived_dead: false, had_a_unique_name_never_given_before: false },
  dawud:     { nephew_of_ibrahim: false, sent_to_madyan: false, sent_to_ad: false, sent_to_thamud: false, interpreted_dreams: false, built_kaaba: false, cured_sick_or_revived_dead: false, had_a_unique_name_never_given_before: false },
  sulayman:  { nephew_of_ibrahim: false, sent_to_madyan: false, sent_to_ad: false, sent_to_thamud: false, interpreted_dreams: false, built_kaaba: false, cured_sick_or_revived_dead: false, had_a_unique_name_never_given_before: false },
  ilyas:     { nephew_of_ibrahim: false, sent_to_madyan: false, sent_to_ad: false, sent_to_thamud: false, interpreted_dreams: false, built_kaaba: false, cured_sick_or_revived_dead: false, had_a_unique_name_never_given_before: false },
  "al-yasa": { nephew_of_ibrahim: false, sent_to_madyan: false, sent_to_ad: false, sent_to_thamud: false, interpreted_dreams: false, built_kaaba: false, cured_sick_or_revived_dead: false, had_a_unique_name_never_given_before: false },
  yunus:     { nephew_of_ibrahim: false, sent_to_madyan: false, sent_to_ad: false, sent_to_thamud: false, interpreted_dreams: false, built_kaaba: false, cured_sick_or_revived_dead: false, had_a_unique_name_never_given_before: false },
  zakariya:  { nephew_of_ibrahim: false, sent_to_madyan: false, sent_to_ad: false, sent_to_thamud: false, interpreted_dreams: false, built_kaaba: false, cured_sick_or_revived_dead: false, had_a_unique_name_never_given_before: false },
  yahya:     { nephew_of_ibrahim: false, sent_to_madyan: false, sent_to_ad: false, sent_to_thamud: false, interpreted_dreams: false, built_kaaba: false, cured_sick_or_revived_dead: false, had_a_unique_name_never_given_before: true },
  isa:       { nephew_of_ibrahim: false, sent_to_madyan: false, sent_to_ad: false, sent_to_thamud: false, interpreted_dreams: false, built_kaaba: false, cured_sick_or_revived_dead: true,  had_a_unique_name_never_given_before: false },
  muhammad:  { nephew_of_ibrahim: false, sent_to_madyan: false, sent_to_ad: false, sent_to_thamud: false, interpreted_dreams: false, built_kaaba: false, cured_sick_or_revived_dead: false, had_a_unique_name_never_given_before: false },
};

// =============================================================================
// v3 attributes — contemporaries + "is there a Surah named after him" —
// added because v2 still left some Prophets hard to narrow down on,
// and "lived during the time of <named Prophet>" is a high-signal
// narrower that maps cleanly to Qur'anic narrative.
//
// Note on Yaqub being contemporary_of_ibrahim: Qur'an 21:72 says
// Ibrahim was given Ishaq and Yaqub (as a gift); mainstream tafsir
// reads this as Yaqub being born during Ibrahim's lifetime.
//
// Note on Shuayb being contemporary_of_musa: Qur'an 28:22-28 narrates
// Musa meeting the elder of Madyan whose daughter he later married.
// Mainstream view identifies that elder as Prophet Shuayb. A minority
// view holds it was a different person of the same name — I went with
// the mainstream identification.
//
// For Dhul-Kifl I marked all three contemporary_* as null because the
// Qur'an doesn't give us a clear era anchor for him.
// =============================================================================
const PROPHET_EXTRA_ATTRIBUTES_V3: Record<string, Record<string, boolean | null>> = {
  adam:        { has_surah_named_after_him: false, contemporary_of_ibrahim: false, contemporary_of_musa: false, contemporary_of_dawud: false },
  idris:       { has_surah_named_after_him: false, contemporary_of_ibrahim: false, contemporary_of_musa: false, contemporary_of_dawud: false },
  nuh:         { has_surah_named_after_him: true,  contemporary_of_ibrahim: false, contemporary_of_musa: false, contemporary_of_dawud: false },
  hud:         { has_surah_named_after_him: true,  contemporary_of_ibrahim: false, contemporary_of_musa: false, contemporary_of_dawud: false },
  salih:       { has_surah_named_after_him: false, contemporary_of_ibrahim: false, contemporary_of_musa: false, contemporary_of_dawud: false },
  ibrahim:     { has_surah_named_after_him: true,  contemporary_of_ibrahim: true,  contemporary_of_musa: false, contemporary_of_dawud: false },
  lut:         { has_surah_named_after_him: false, contemporary_of_ibrahim: true,  contemporary_of_musa: false, contemporary_of_dawud: false },
  ismail:      { has_surah_named_after_him: false, contemporary_of_ibrahim: true,  contemporary_of_musa: false, contemporary_of_dawud: false },
  ishaq:       { has_surah_named_after_him: false, contemporary_of_ibrahim: true,  contemporary_of_musa: false, contemporary_of_dawud: false },
  yaqub:       { has_surah_named_after_him: false, contemporary_of_ibrahim: true,  contemporary_of_musa: false, contemporary_of_dawud: false },
  yusuf:       { has_surah_named_after_him: true,  contemporary_of_ibrahim: false, contemporary_of_musa: false, contemporary_of_dawud: false },
  ayyub:       { has_surah_named_after_him: false, contemporary_of_ibrahim: false, contemporary_of_musa: false, contemporary_of_dawud: false },
  shuayb:      { has_surah_named_after_him: false, contemporary_of_ibrahim: false, contemporary_of_musa: true,  contemporary_of_dawud: false },
  musa:        { has_surah_named_after_him: false, contemporary_of_ibrahim: false, contemporary_of_musa: true,  contemporary_of_dawud: false },
  harun:       { has_surah_named_after_him: false, contemporary_of_ibrahim: false, contemporary_of_musa: true,  contemporary_of_dawud: false },
  "dhul-kifl": { has_surah_named_after_him: false, contemporary_of_ibrahim: null,  contemporary_of_musa: null,  contemporary_of_dawud: null  },
  dawud:       { has_surah_named_after_him: false, contemporary_of_ibrahim: false, contemporary_of_musa: false, contemporary_of_dawud: true  },
  sulayman:    { has_surah_named_after_him: false, contemporary_of_ibrahim: false, contemporary_of_musa: false, contemporary_of_dawud: true  },
  ilyas:       { has_surah_named_after_him: false, contemporary_of_ibrahim: false, contemporary_of_musa: false, contemporary_of_dawud: false },
  "al-yasa":   { has_surah_named_after_him: false, contemporary_of_ibrahim: false, contemporary_of_musa: false, contemporary_of_dawud: false },
  yunus:       { has_surah_named_after_him: true,  contemporary_of_ibrahim: false, contemporary_of_musa: false, contemporary_of_dawud: false },
  zakariya:    { has_surah_named_after_him: false, contemporary_of_ibrahim: false, contemporary_of_musa: false, contemporary_of_dawud: false },
  yahya:       { has_surah_named_after_him: false, contemporary_of_ibrahim: false, contemporary_of_musa: false, contemporary_of_dawud: false },
  isa:         { has_surah_named_after_him: false, contemporary_of_ibrahim: false, contemporary_of_musa: false, contemporary_of_dawud: false },
  muhammad:    { has_surah_named_after_him: true,  contemporary_of_ibrahim: false, contemporary_of_musa: false, contemporary_of_dawud: false },
};

// Merge descriptions + extra attributes into each Prophet record so the
// rest of the code (catalog endpoint, answerQuestion, redactRound) just
// sees a complete record. Done once at module init.
for (const p of PROPHETS) {
  p.description = PROPHET_DESCRIPTIONS[p.id] ?? "";
  const extrasV2 = PROPHET_EXTRA_ATTRIBUTES[p.id];
  const extrasV3 = PROPHET_EXTRA_ATTRIBUTES_V3[p.id];
  p.attributes = {
    ...p.attributes,
    ...(extrasV2 ?? {}),
    ...(extrasV3 ?? {}),
  };
  // Loud failure during local dev if any prophet was missed when adding
  // new entries — better than a silent "(description not set)" in prod.
  if (!p.description) {
    console.warn(`[prophetGuessData] Prophet ${p.id} has no description`);
  }
}

// Quick lookup helpers
export const PROPHETS_BY_ID = new Map(PROPHETS.map((p) => [p.id, p]));
export const QUESTIONS_BY_ID = new Map(QUESTIONS.map((q) => [q.id, q]));

/** Returns 'yes' / 'no' / 'unknown' for the asked question on the chosen prophet. */
export function answerQuestion(prophetId: string, questionId: string): "yes" | "no" | "unknown" {
  const prophet = PROPHETS_BY_ID.get(prophetId);
  const question = QUESTIONS_BY_ID.get(questionId);
  if (!prophet || !question) return "unknown";
  const val = prophet.attributes[question.attribute];
  if (val === true) return "yes";
  if (val === false) return "no";
  return "unknown";
}
