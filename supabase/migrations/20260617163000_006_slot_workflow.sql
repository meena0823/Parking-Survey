/*
  Slot workflow upgrade:
  - Grace period support on survey projects
  - Extended slot statuses for deterministic scheduler
  - Slot completion tracking per enumerator per slot
*/

ALTER TABLE survey_projects
ADD COLUMN IF NOT EXISTS grace_period_minutes integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'survey_slots_status_check'
      AND conrelid = 'survey_slots'::regclass
  ) THEN
    ALTER TABLE survey_slots DROP CONSTRAINT survey_slots_status_check;
  END IF;
END $$;

ALTER TABLE survey_slots
ADD CONSTRAINT survey_slots_status_check
CHECK (status IN ('pending','active','grace_period','waiting_for_completion','completed'));

CREATE TABLE IF NOT EXISTS slot_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES survey_projects(id) ON DELETE CASCADE,
  slot_id uuid NOT NULL REFERENCES survey_slots(id) ON DELETE CASCADE,
  enumerator_id uuid NOT NULL REFERENCES enumerators(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed')),
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE (slot_id, enumerator_id)
);

ALTER TABLE slot_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_project_slot_completions" ON slot_completions;
CREATE POLICY "select_project_slot_completions" ON slot_completions
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM survey_projects sp
    JOIN team_heads th ON sp.team_head_id = th.id
    WHERE sp.id = slot_completions.project_id
      AND th.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "insert_project_slot_completions" ON slot_completions;
CREATE POLICY "insert_project_slot_completions" ON slot_completions
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM survey_projects sp
    JOIN team_heads th ON sp.team_head_id = th.id
    WHERE sp.id = slot_completions.project_id
      AND th.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "update_project_slot_completions" ON slot_completions;
CREATE POLICY "update_project_slot_completions" ON slot_completions
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM survey_projects sp
    JOIN team_heads th ON sp.team_head_id = th.id
    WHERE sp.id = slot_completions.project_id
      AND th.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM survey_projects sp
    JOIN team_heads th ON sp.team_head_id = th.id
    WHERE sp.id = slot_completions.project_id
      AND th.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "anon_select_slot_completions" ON slot_completions;
CREATE POLICY "anon_select_slot_completions" ON slot_completions
FOR SELECT TO anon
USING (true);

DROP POLICY IF EXISTS "anon_insert_slot_completions" ON slot_completions;
CREATE POLICY "anon_insert_slot_completions" ON slot_completions
FOR INSERT TO anon
WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_slot_completions" ON slot_completions;
CREATE POLICY "anon_update_slot_completions" ON slot_completions
FOR UPDATE TO anon
USING (true)
WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_slot_completions_project ON slot_completions(project_id);
CREATE INDEX IF NOT EXISTS idx_slot_completions_slot ON slot_completions(slot_id);
CREATE INDEX IF NOT EXISTS idx_slot_completions_enumerator ON slot_completions(enumerator_id);
