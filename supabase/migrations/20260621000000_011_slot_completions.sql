/*
  Migration 011 — Create slot_completions table
  ==============================================
  Safe to run multiple times (fully idempotent — uses IF NOT EXISTS / DROP POLICY IF EXISTS).

  WHY this table is needed instead of reusing survey_slots:
  ─────────────────────────────────────────────────────────
  survey_slots has ONE row per time-slot.  Its `status` column is the Team-Head-
  controlled lifecycle state (pending → active → completed).  It has no concept
  of individual enumerators.

  "Mark as Done" is a PER-ENUMERATOR signal ("I, enumerator X, am finished with
  slot Y").  A survey with 4 enumerators needs 4 independent signals for the same
  slot.  That requires a separate junction table keyed on (slot_id, enumerator_id).

  This migration was originally defined in 006_slot_workflow.sql but was never
  applied to the live Supabase project.  This file brings the live schema in sync.
*/

-- ── Table ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS slot_completions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid        NOT NULL REFERENCES survey_projects(id) ON DELETE CASCADE,
  slot_id       uuid        NOT NULL REFERENCES survey_slots(id)    ON DELETE CASCADE,
  enumerator_id uuid        NOT NULL REFERENCES enumerators(id)     ON DELETE CASCADE,
  status        text        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'completed')),
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slot_id, enumerator_id)
);

-- ── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE slot_completions ENABLE ROW LEVEL SECURITY;

-- Authenticated team heads: full access scoped to their own projects
DROP POLICY IF EXISTS "select_project_slot_completions" ON slot_completions;
CREATE POLICY "select_project_slot_completions" ON slot_completions
  FOR SELECT TO authenticated
  USING (
    project_id IN (
      SELECT sp.id FROM survey_projects sp
      JOIN team_heads th ON sp.team_head_id = th.id
      WHERE th.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_project_slot_completions" ON slot_completions;
CREATE POLICY "insert_project_slot_completions" ON slot_completions
  FOR INSERT TO authenticated
  WITH CHECK (
    project_id IN (
      SELECT sp.id FROM survey_projects sp
      JOIN team_heads th ON sp.team_head_id = th.id
      WHERE th.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "update_project_slot_completions" ON slot_completions;
CREATE POLICY "update_project_slot_completions" ON slot_completions
  FOR UPDATE TO authenticated
  USING (
    project_id IN (
      SELECT sp.id FROM survey_projects sp
      JOIN team_heads th ON sp.team_head_id = th.id
      WHERE th.user_id = auth.uid()
    )
  )
  WITH CHECK (
    project_id IN (
      SELECT sp.id FROM survey_projects sp
      JOIN team_heads th ON sp.team_head_id = th.id
      WHERE th.user_id = auth.uid()
    )
  );

-- Enumerators connect as the anon role (they have no Supabase auth session).
-- They must be able to INSERT and UPDATE their own completion records.
DROP POLICY IF EXISTS "anon_select_slot_completions" ON slot_completions;
CREATE POLICY "anon_select_slot_completions" ON slot_completions
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "anon_insert_slot_completions" ON slot_completions;
CREATE POLICY "anon_insert_slot_completions" ON slot_completions
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_slot_completions" ON slot_completions;
CREATE POLICY "anon_update_slot_completions" ON slot_completions
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_slot_completions_project    ON slot_completions(project_id);
CREATE INDEX IF NOT EXISTS idx_slot_completions_slot       ON slot_completions(slot_id);
CREATE INDEX IF NOT EXISTS idx_slot_completions_enumerator ON slot_completions(enumerator_id);

-- ── Realtime publication ─────────────────────────────────────────────────────
-- Adds the table to the supabase_realtime publication so that ProjectDetail.tsx
-- and EnumeratorInterface.tsx receive instant postgres_changes events.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'slot_completions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE slot_completions;
  END IF;
END $$;
