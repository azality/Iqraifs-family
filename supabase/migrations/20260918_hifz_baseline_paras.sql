-- What a child had already memorized BEFORE we started logging.
--
-- Our hifz records begin 3 Sep 2026. A child who memorized ten paras
-- last year shows only the one or two they have been heard on since,
-- so the exam-syllabus proposal understates almost everyone on the
-- first run and the teacher ends up retyping 84 lines (Muneeb, 17 Sep).
--
-- The office enters this once per child; every future proposal starts
-- from it instead of from zero. Stored as the SET of paras rather than
-- a count: plenty of children do Amma (28-30) before Para 1, so "has
-- done 4 paras" cannot be turned back into which four.

alter table student
  add column if not exists hifz_baseline_paras smallint[];

comment on column student.hifz_baseline_paras is
  'Paras memorized before hifz logging began (1-30). Merged with logged '
  'entries when proposing an exam syllabus. Null/empty = nothing prior.';

notify pgrst, 'reload schema';
