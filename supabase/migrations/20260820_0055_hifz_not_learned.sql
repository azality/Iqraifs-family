-- =============================================================================
-- hifz_progress.quality: add 'not_learned'
-- =============================================================================
-- Why (pilot question from the hifz incharge): "agr sabaq/sabqi/manzil me
-- se koi chiz yad nai to?" A child coming unprepared is a distinct,
-- honest outcome (sabaq repeats tomorrow) - recording it as "weak" with a
-- note buried the signal.

ALTER TABLE hifz_progress DROP CONSTRAINT hifz_progress_quality_check;
ALTER TABLE hifz_progress ADD CONSTRAINT hifz_progress_quality_check
  CHECK (quality = ANY (ARRAY['excellent'::text,'good'::text,'needs_practice'::text,'weak'::text,'not_learned'::text]));
