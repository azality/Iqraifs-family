-- =============================================================================
-- Named bell schedules: timetable_slot.schedule_key + class_section.schedule_key
-- =============================================================================
-- Why:
--   Iqra IFS runs two bell schedules: the 7-period secondary day and the
--   primary day (6 periods + Nazra, different times). Slots are org-wide,
--   so every section's editor showed BOTH sets - Class I displayed 34
--   filled primary slots plus 34 empty secondary ghosts ("+ Assign").
--
-- Model:
--   Every slot belongs to a named schedule ('default' unless set) and every
--   section follows exactly one schedule. Section views and editors only
--   see slots of the section's schedule. The week-template editor manages
--   the 'default' schedule; other schedules are only touched explicitly.
-- =============================================================================

ALTER TABLE timetable_slot ADD COLUMN IF NOT EXISTS schedule_key text NOT NULL DEFAULT 'default';
ALTER TABLE class_section  ADD COLUMN IF NOT EXISTS schedule_key text NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS idx_timetable_slot_schedule ON timetable_slot(org_id, schedule_key);
