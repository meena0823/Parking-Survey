/*
  Prevent duplicate enumerator records per survey project.

  Strategy: keep the OLDEST row for each (project_id, mobile) pair
  (preserves the most historical captures), then add the unique constraint
  so future inserts/upserts cannot create duplicates.

  Safe to run on an empty or existing database.
*/

-- 1. Delete newer duplicates, preserving the earliest record per project + mobile.
--    The DELETE uses a sub-query so it works on PostgreSQL without CTEs in DELETE.
DELETE FROM enumerators
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY project_id, mobile
             ORDER BY joined_at ASC   -- keep the OLDEST
           ) AS rn
    FROM enumerators
  ) ranked
  WHERE rn > 1
);

-- 2. Add the unique constraint (idempotent via DO block).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'enumerators_project_mobile_unique'
      AND conrelid = 'enumerators'::regclass
  ) THEN
    ALTER TABLE enumerators
      ADD CONSTRAINT enumerators_project_mobile_unique
      UNIQUE (project_id, mobile);
  END IF;
END $$;
