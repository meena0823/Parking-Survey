/*
  Survey Lifecycle Management upgrade
  - New columns on survey_slots: actual_started_at, actual_completed_at,
    started_by, completed_by, completion_reason
  - Simplified slot status: pending | active | completed | cancelled
    (removes grace_period, waiting_for_completion which were automated;
     lifecycle is now fully manual by Team Head)
  - survey_projects.status gains 'cancelled'
*/

-- ── survey_slots: new lifecycle columns ────────────────────────────────────
ALTER TABLE survey_slots ADD COLUMN IF NOT EXISTS actual_started_at   timestamptz;
ALTER TABLE survey_slots ADD COLUMN IF NOT EXISTS actual_completed_at timestamptz;
ALTER TABLE survey_slots ADD COLUMN IF NOT EXISTS started_by          text;
ALTER TABLE survey_slots ADD COLUMN IF NOT EXISTS completed_by        text;
ALTER TABLE survey_slots ADD COLUMN IF NOT EXISTS completion_reason   text;

-- Drop ALL existing check constraints on survey_slots.status (handles any auto-name)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'survey_slots'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%status%'
  LOOP
    EXECUTE 'ALTER TABLE survey_slots DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
  END LOOP;
END $$;

-- Migrate any rows still in automated statuses → active
UPDATE survey_slots
SET status = 'active'
WHERE status IN ('grace_period', 'waiting_for_completion', 'locked');

ALTER TABLE survey_slots
ADD CONSTRAINT survey_slots_status_check
CHECK (status IN ('pending', 'active', 'completed', 'cancelled'));

-- ── survey_projects: add 'cancelled' status ────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'survey_projects'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%status%'
  LOOP
    EXECUTE 'ALTER TABLE survey_projects DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
  END LOOP;
END $$;

ALTER TABLE survey_projects
ADD CONSTRAINT survey_projects_status_check
CHECK (status IN ('draft', 'active', 'completed', 'cancelled'));
