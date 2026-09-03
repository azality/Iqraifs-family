-- Incharge role (school's answer, Sep 3 2026):
--   Montessori incharge      - Rabia Ghori  - Reception / Junior / Senior
--   Primary+Secondary        - Amna Shahzad - Class I .. Class X
--   Hifz incharge            - Rizwan Barkat- Hifz I .. Hifz IV
--
-- Model: role_type 'incharge' with one user_roles row PER CLASS in the
-- wing (scope_type='class', scope_id=class.id). Note scope_id holds a
-- CLASS id here, not a class_section id (visiting_teacher rows use
-- section ids on the same scope_type; getOrgRoles resolves both).
-- New sections added to a wing class are covered automatically.
--
-- Powers: teacher-equivalent access WITHIN wing sections + wing-scoped
-- dashboards (leaderboard, Daily academics, hifz program for hifz
-- wings). NO org-level powers: fees, settings, teacher management,
-- role grants, day-note writes all stay principal/admin.

ALTER TYPE role_type ADD VALUE IF NOT EXISTS 'incharge';
