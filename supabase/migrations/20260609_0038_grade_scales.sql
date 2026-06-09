-- Configurable grade scale per org — PR feat/grade-scales (PR 3 polish).
--
-- Until now the report-card endpoint used a hardcoded scale (A+ 90+,
-- A 80+, etc). Schools actually differ — Iqra Academy uses A+ at 85,
-- some boards use a 4-band scale with no F, others use Excellent/Good/
-- Satisfactory/Poor without letter grades at all.
--
-- Two tables. A scale is the named container; the bands are the rows
-- (one per letter / category). Bands are half-open `[min_pct, max_pct)`
-- so 80–89.99 → A and 90+ → A+ with no overlap. The top band can
-- specify max_pct = 100 inclusive (treated as <= rather than <).
--
-- One default per org via partial UNIQUE — same pattern as
-- academic_term.is_current.

CREATE TABLE IF NOT EXISTS public.grade_scale (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name         text NOT NULL,
  is_default   boolean NOT NULL DEFAULT false,
  archived_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);
CREATE UNIQUE INDEX IF NOT EXISTS grade_scale_one_default_per_org
  ON public.grade_scale(org_id)
  WHERE is_default AND archived_at IS NULL;

CREATE TABLE IF NOT EXISTS public.grade_scale_band (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scale_id       uuid NOT NULL REFERENCES public.grade_scale(id) ON DELETE CASCADE,
  letter         text NOT NULL,                  -- "A+", "A", "B", or even "Excellent"
  min_pct        numeric(5,2) NOT NULL CHECK (min_pct >= 0 AND min_pct <= 100),
  max_pct        numeric(5,2) NOT NULL CHECK (max_pct >= 0 AND max_pct <= 100),
  remark         text,                            -- "Excellent", "Needs improvement", etc
  display_order  int NOT NULL DEFAULT 0,
  CHECK (max_pct > min_pct OR (max_pct = 100 AND min_pct = 100))
);
CREATE INDEX IF NOT EXISTS idx_grade_band_scale
  ON public.grade_scale_band(scale_id, display_order);
