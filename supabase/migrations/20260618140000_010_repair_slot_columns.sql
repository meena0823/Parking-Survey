/*
  Repair / bootstrap migration — safe to run on any Supabase instance.

  Root cause of "Survey slots are no longer visible":
    When migration 008 (break_after_minutes) was deployed in code but not yet
    applied to the database, every survey_slots INSERT included a column that
    didn't exist.  Supabase returned a column-does-not-exist error, but
    createSlots() was silently discarding the `error` field and returning [],
    so projects were created with ZERO slots.  The dashboard then showed
    "All slots are completed or cancelled" (vacuously true for an empty array)
    AND "No slots yet" in the timeline — two contradictory messages from the
    same empty slots array.

  This migration adds every column that the TypeScript codebase expects to
  exist on survey_slots and survey_projects, using IF NOT EXISTS / DEFAULT
  guards throughout so it is completely safe to re-run.
*/

-- ── survey_projects: columns added in migrations 006+ ────────────────────────
ALTER TABLE survey_projects
  ADD COLUMN IF NOT EXISTS grace_period_minutes integer NOT NULL DEFAULT 0;

-- ── survey_slots: columns added in migrations 007 + 008 ──────────────────────
ALTER TABLE survey_slots
  ADD COLUMN IF NOT EXISTS actual_started_at   timestamptz,
  ADD COLUMN IF NOT EXISTS actual_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS started_by          text,
  ADD COLUMN IF NOT EXISTS completed_by        text,
  ADD COLUMN IF NOT EXISTS completion_reason   text;

-- THE critical column: absence of this column causes every new slot INSERT to
-- be silently rejected, leaving projects with zero visible slots.
ALTER TABLE survey_slots
  ADD COLUMN IF NOT EXISTS break_after_minutes integer NOT NULL DEFAULT 0;

-- ── Normalize any stale slot statuses ────────────────────────────────────────
-- Slots that were set to old automated statuses (from the pre-007 scheduler)
-- are moved to 'active' so they remain visible and usable.
UPDATE survey_slots
   SET status = 'active'
 WHERE status IN ('grace_period', 'waiting_for_completion', 'locked');

-- ── Ensure the status constraint allows 'cancelled' (added in migration 007) ─
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'survey_slots'::regclass
      AND contype   = 'c'
      AND pg_get_constraintdef(oid) LIKE '%status%'
  LOOP
    EXECUTE 'ALTER TABLE survey_slots DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
  END LOOP;
END $$;

ALTER TABLE survey_slots
  ADD CONSTRAINT survey_slots_status_check
  CHECK (status IN ('pending', 'active', 'completed', 'cancelled'));

-- ── survey_notifications (added in migration 008) ────────────────────────────
CREATE TABLE IF NOT EXISTS survey_notifications (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid        NOT NULL REFERENCES survey_projects(id) ON DELETE CASCADE,
  team_head_id  uuid        REFERENCES team_heads(id) ON DELETE CASCADE,
  type          text        NOT NULL CHECK (type IN (
                  'upcoming_slot', 'slot_not_started', 'slot_ending_soon',
                  'survey_completed', 'survey_paused', 'survey_resumed'
                )),
  title         text        NOT NULL,
  message       text        NOT NULL,
  slot_id       uuid        REFERENCES survey_slots(id) ON DELETE SET NULL,
  is_read       boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE survey_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_head_notifications_all" ON survey_notifications;
CREATE POLICY "team_head_notifications_all" ON survey_notifications
  FOR ALL TO authenticated
  USING (
    project_id IN (
      SELECT id FROM survey_projects
      WHERE team_head_id IN (SELECT id FROM team_heads WHERE user_id = auth.uid())
    )
  )
  WITH CHECK (
    project_id IN (
      SELECT id FROM survey_projects
      WHERE team_head_id IN (SELECT id FROM team_heads WHERE user_id = auth.uid())
    )
  );

-- Add survey_notifications to realtime if not already present (safe to re-run)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'survey_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE survey_notifications;
  END IF;
END $$;
