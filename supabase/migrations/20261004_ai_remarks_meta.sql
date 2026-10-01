-- Auto-generated remarks bookkeeping (v1.23.0, 2 Oct decision):
-- finalizing a card pre-fills AI remark drafts; this column is what
-- keeps that cheap and safe.
--
--   hash        SHA-256 of the generation inputs (marks, attendance,
--               behavior, observations, prior term). Re-finalizing a
--               card whose inputs did not change costs ZERO tokens.
--   generatedAt when the current drafts were written.
--   usage       tokens that generation spent (cost transparency).
--   fields      the exact draft text written per field, so a later
--               regeneration overwrites ONLY text that is still the
--               AI's own - anything a human edited is never touched.
--
-- Idempotent; additive; nothing reads it before v1.23.0 deploys.

alter table public.term_report_card
  add column if not exists ai_remarks_meta jsonb;

comment on column public.term_report_card.ai_remarks_meta is
  'Auto-remark bookkeeping {hash, generatedAt, usage, fields} - dedupe + the never-overwrite-human-text guard (v1.23.0)';
