/*
  Break Interval + Notification System
  - break_after_minutes on survey_slots (planned pause after each slot)
  - survey_notifications table for Team Head alerts
*/

-- ── survey_slots: break interval column ─────────────────────────────────────
ALTER TABLE survey_slots
  ADD COLUMN IF NOT EXISTS break_after_minutes integer NOT NULL DEFAULT 0;

-- ── survey_notifications ─────────────────────────────────────────────────────
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

-- Team heads can manage their own project notifications
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

-- Realtime for notifications (so badge updates instantly)
ALTER PUBLICATION supabase_realtime ADD TABLE survey_notifications;
