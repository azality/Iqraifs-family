-- Remarks round 3 (2 Oct design review): the AI remark should be built
-- on EVIDENCE - "a supported observation + one practical next step" -
-- and the one input only a human can supply is what the teacher saw.
-- One optional observation per subject per card: a selected need
-- ("incomplete answers", "difficulty recalling content", "needs help
-- applying concepts" or free text) plus a few of the teacher's own
-- words. Never preselected from marks; never printed; feeds the
-- suggester and the teacher panel.
--
-- Shape: { "<class_subject_id>": { "need": "...", "note": "..." } }
--
-- Idempotent; additive; nothing reads it before v1.22.0 deploys.

alter table public.term_report_card
  add column if not exists subject_observations jsonb;

comment on column public.term_report_card.subject_observations is
  'Per-subject teacher observations {class_subject_id: {need, note}} - evidence for AI-suggested remarks, never printed directly (v1.22.0)';
