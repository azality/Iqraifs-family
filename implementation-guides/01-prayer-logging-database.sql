-- ============================================================================
-- PRAYER LOGGING DATABASE SCHEMA
-- ============================================================================
-- File: /implementation-guides/01-prayer-logging-database.sql
-- Purpose: Create tables for prayer claims, approvals, and denials
-- ============================================================================

-- STEP 1: Create prayer_claims table
-- ----------------------------------------------------------------------------
CREATE TABLE prayer_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  prayer VARCHAR(20) NOT NULL CHECK (prayer IN ('Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha')),
  date DATE NOT NULL, -- Local family timezone date
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'partially_approved', 'fully_approved', 'denied')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- CRITICAL: One claim per child/prayer/day
  CONSTRAINT one_claim_per_day UNIQUE (child_id, prayer, date)
);

-- Add indexes for performance
CREATE INDEX idx_prayer_claims_child_date ON prayer_claims(child_id, date);
CREATE INDEX idx_prayer_claims_status ON prayer_claims(status) WHERE status = 'pending';

-- Add trigger to update updated_at
CREATE TRIGGER update_prayer_claims_updated_at
  BEFORE UPDATE ON prayer_claims
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- STEP 2: Create prayer_approvals table
-- ----------------------------------------------------------------------------
CREATE TABLE prayer_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES prayer_claims(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES users(id),
  approved_at TIMESTAMPTZ DEFAULT NOW(),
  points_awarded INT NOT NULL,
  
  -- CRITICAL: One approval per parent per claim (prevents double-award bug)
  CONSTRAINT one_approval_per_parent UNIQUE (claim_id, parent_id)
);

-- Add indexes
CREATE INDEX idx_prayer_approvals_claim ON prayer_approvals(claim_id);
CREATE INDEX idx_prayer_approvals_parent ON prayer_approvals(parent_id);

-- STEP 3: Create prayer_denials table (optional)
-- ----------------------------------------------------------------------------
CREATE TABLE prayer_denials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES prayer_claims(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES users(id),
  denied_at TIMESTAMPTZ DEFAULT NOW(),
  reason TEXT,
  
  -- One denial per parent per claim
  CONSTRAINT one_denial_per_parent UNIQUE (claim_id, parent_id)
);

-- Add indexes
CREATE INDEX idx_prayer_denials_claim ON prayer_denials(claim_id);

-- STEP 4: Update point_events table for prayer tracking
-- ----------------------------------------------------------------------------
ALTER TABLE point_events
ADD COLUMN prayer_claim_id UUID REFERENCES prayer_claims(id),
ADD COLUMN approved_by UUID REFERENCES users(id),
ADD COLUMN approval_number INT CHECK (approval_number IN (1, 2));

-- CRITICAL: One prayer per child per day (prevents duplicate logs)
CREATE UNIQUE INDEX idx_one_prayer_per_day 
ON point_events (child_id, behavior_name, DATE(occurred_at AT TIME ZONE 'UTC'))
WHERE behavior_name IN ('Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha');

-- STEP 5: Create helper function for family timezone
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_family_timezone(p_family_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_timezone TEXT;
BEGIN
  SELECT timezone INTO v_timezone
  FROM families
  WHERE id = p_family_id;
  
  RETURN COALESCE(v_timezone, 'America/New_York');
END;
$$ LANGUAGE plpgsql;

-- STEP 6: Grant permissions
-- ----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON prayer_claims TO authenticated;
GRANT SELECT, INSERT ON prayer_approvals TO authenticated;
GRANT SELECT, INSERT ON prayer_denials TO authenticated;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify tables created
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name LIKE 'prayer_%';

-- Verify constraints
SELECT conname, contype 
FROM pg_constraint 
WHERE conrelid = 'prayer_claims'::regclass
  OR conrelid = 'prayer_approvals'::regclass;

-- Verify indexes
SELECT indexname 
FROM pg_indexes 
WHERE tablename LIKE 'prayer_%';
