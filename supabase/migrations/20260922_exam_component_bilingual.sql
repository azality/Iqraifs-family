-- A paper row in both languages.
--
-- The Hifz half-yearly rows were seeded as the slip prints them, in
-- Urdu: سوال اول, صفات و مخارج, لہجہ, مسائل. Those headings then showed
-- in Urdu on the English marks sheet too, because the row's name is the
-- only name it has (Muneeb, 22 Sep).
--
-- So a row may carry a second name. `name` stays what the paper prints;
-- `name_en` is the same row in English, and the sheet shows whichever
-- matches the reader's language, falling back to the other. A school
-- that prints only one language leaves the twin empty and nothing
-- changes for them.

alter table exam_component
  add column if not exists name_en text;

-- The braced heading gets the same treatment — the printed slip needs it
-- in whichever language the slip is being printed in.
alter table exam_component
  add column if not exists group_label_en text;

notify pgrst, 'reload schema';
