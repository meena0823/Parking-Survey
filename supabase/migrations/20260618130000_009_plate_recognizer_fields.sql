-- Migration 009: Add Plate Recognizer enrichment columns to vehicle_captures
--
-- New columns store per-vehicle data returned by the Plate Recognizer Cloud API:
--   vehicle_make           — manufacturer (Honda, Toyota, Maruti, etc.)
--   vehicle_model          — model name  (City, Swift, Creta, etc.)
--   vehicle_color          — dominant body colour (white, silver, red, etc.)
--   plate_confidence       — 0–1 confidence score from Plate Recognizer for the plate
--   detailed_vehicle_type  — raw PR type (Sedan, SUV, Hatchback, Pickup, Van, etc.)
--
-- vehicle_number already exists from migration 004.
-- vehicle_type (survey category: car, two_wheeler, auto, bus, truck, lcv, others)
-- continues to be set by the existing YOLO + mapping logic.

ALTER TABLE vehicle_captures
  ADD COLUMN IF NOT EXISTS vehicle_make          text,
  ADD COLUMN IF NOT EXISTS vehicle_model         text,
  ADD COLUMN IF NOT EXISTS vehicle_color         text,
  ADD COLUMN IF NOT EXISTS plate_confidence      numeric(5, 4),
  ADD COLUMN IF NOT EXISTS detailed_vehicle_type text;

-- Helpful comment index for analytics queries filtering by make/model
COMMENT ON COLUMN vehicle_captures.vehicle_make          IS 'Vehicle manufacturer from Plate Recognizer (e.g. Honda, Toyota)';
COMMENT ON COLUMN vehicle_captures.vehicle_model         IS 'Vehicle model from Plate Recognizer (e.g. City, Creta, Swift)';
COMMENT ON COLUMN vehicle_captures.vehicle_color         IS 'Dominant body colour from Plate Recognizer (e.g. white, silver)';
COMMENT ON COLUMN vehicle_captures.plate_confidence      IS 'Plate Recognizer confidence score for the plate reading (0–1)';
COMMENT ON COLUMN vehicle_captures.detailed_vehicle_type IS 'Raw Plate Recognizer vehicle type: Sedan, SUV, Hatchback, Pickup, Van, Motorcycle, etc.';
