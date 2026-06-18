-- Optional license plate / vehicle number for manual and ML captures
ALTER TABLE vehicle_captures
  ADD COLUMN IF NOT EXISTS vehicle_number text;
