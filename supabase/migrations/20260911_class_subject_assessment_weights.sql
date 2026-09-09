-- School-defined assessment weightage per subject (Muneeb, 11 Sep):
-- e.g. Urdu = oral 40 / written 60; Science = written 60 / practical 15
-- / tests 10 / attendance 5 / quizzes 5 / etc. Stored as a jsonb array
-- of { label, pct } components the school enters in the subject editor.
--
-- Display/guidance only for now: the marks sheet shows the split under
-- each subject so max marks are set to match (marks-as-weight — the
-- report card already computes sum(weight×obtained)/sum(weight×max)).
-- Auto-computed components (attendance %, gradebook averages) are a
-- separate, explicitly-approved change if the school wants them.

ALTER TABLE class_subject
  ADD COLUMN IF NOT EXISTS assessment_weights jsonb;
