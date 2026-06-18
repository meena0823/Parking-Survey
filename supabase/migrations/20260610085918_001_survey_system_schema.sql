/*
# Traffic/Parking Survey Management System - Complete Schema

1. New Tables (in dependency order)
- `team_heads`: Team Head/Supervisor profiles linked to auth.users
- `admin_users`: Admin panel users
- `survey_projects`: Main project container for each survey
- `enumerators`: Enumerator registration data
- `survey_rooms`: Active survey rooms for real-time coordination
- `survey_slots`: Time slots generated per project
- `vehicle_captures`: Individual vehicle image captures
- `vehicle_counts`: Aggregated vehicle counts per slot per enumerator
- `chat_messages`: Real-time chat between team head and enumerators

2. Security
- RLS enabled on all tables.
- Team Heads access only their own projects and related data.
- Admin users have their own profile access.
*/

CREATE TABLE IF NOT EXISTS team_heads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  organization text,
  phone text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  role text NOT NULL DEFAULT 'admin' CHECK (role IN ('super_admin','admin')),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS survey_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_head_id uuid NOT NULL REFERENCES team_heads(id) ON DELETE CASCADE,
  project_name text NOT NULL,
  client_name text,
  purpose text,
  survey_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  location_name text,
  latitude double precision,
  longitude double precision,
  boundary_polygon jsonb,
  area_size_sqm double precision,
  num_enumerators integer DEFAULT 1,
  vehicle_categories jsonb DEFAULT '["two_wheeler","car","auto","bus","truck","lcv","others"]',
  survey_duration_hours integer NOT NULL,
  survey_interval_minutes integer NOT NULL DEFAULT 15,
  num_slots integer,
  room_code text UNIQUE DEFAULT upper(substr(md5(random()::text), 1, 6)),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','completed')),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS enumerators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES survey_projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  mobile text NOT NULL,
  email text,
  enumerator_code text NOT NULL,
  assigned_lat double precision,
  assigned_lng double precision,
  gps_lat double precision,
  gps_lng double precision,
  gps_accuracy double precision,
  is_online boolean DEFAULT false,
  battery_level integer,
  network_status text DEFAULT 'unknown',
  camera_permission boolean DEFAULT false,
  last_heartbeat timestamptz,
  joined_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS survey_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES survey_projects(id) ON DELETE CASCADE,
  room_code text UNIQUE NOT NULL,
  is_active boolean DEFAULT true,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS survey_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES survey_projects(id) ON DELETE CASCADE,
  slot_number integer NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','locked','completed')),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vehicle_captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES survey_projects(id) ON DELETE CASCADE,
  enumerator_id uuid NOT NULL REFERENCES enumerators(id) ON DELETE CASCADE,
  slot_id uuid NOT NULL REFERENCES survey_slots(id) ON DELETE CASCADE,
  image_url text,
  thumbnail_url text,
  timestamp timestamptz NOT NULL DEFAULT now(),
  gps_lat double precision,
  gps_lng double precision,
  vehicle_type text,
  ai_count_result integer,
  ai_confidence double precision,
  manual_count integer DEFAULT 1,
  is_verified boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vehicle_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES survey_projects(id) ON DELETE CASCADE,
  enumerator_id uuid NOT NULL REFERENCES enumerators(id) ON DELETE CASCADE,
  slot_id uuid NOT NULL REFERENCES survey_slots(id) ON DELETE CASCADE,
  two_wheeler integer DEFAULT 0,
  car integer DEFAULT 0,
  auto integer DEFAULT 0,
  bus integer DEFAULT 0,
  truck integer DEFAULT 0,
  lcv integer DEFAULT 0,
  others integer DEFAULT 0,
  total integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(enumerator_id, slot_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES survey_rooms(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('team_head','enumerator')),
  sender_id uuid NOT NULL,
  message text NOT NULL,
  is_emergency boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE team_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE enumerators ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- team_heads: owner-scoped
DROP POLICY IF EXISTS "select_own_team_head" ON team_heads;
CREATE POLICY "select_own_team_head" ON team_heads FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_team_head" ON team_heads;
CREATE POLICY "insert_own_team_head" ON team_heads FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_team_head" ON team_heads;
CREATE POLICY "update_own_team_head" ON team_heads FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- admin_users: owner-scoped
DROP POLICY IF EXISTS "select_own_admin" ON admin_users;
CREATE POLICY "select_own_admin" ON admin_users FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_admin" ON admin_users;
CREATE POLICY "insert_own_admin" ON admin_users FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- survey_projects: team head ownership
DROP POLICY IF EXISTS "select_own_projects" ON survey_projects;
CREATE POLICY "select_own_projects" ON survey_projects FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM team_heads WHERE team_heads.id = survey_projects.team_head_id AND team_heads.user_id = auth.uid()));
DROP POLICY IF EXISTS "insert_own_projects" ON survey_projects;
CREATE POLICY "insert_own_projects" ON survey_projects FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM team_heads WHERE team_heads.id = survey_projects.team_head_id AND team_heads.user_id = auth.uid()));
DROP POLICY IF EXISTS "update_own_projects" ON survey_projects;
CREATE POLICY "update_own_projects" ON survey_projects FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM team_heads WHERE team_heads.id = survey_projects.team_head_id AND team_heads.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM team_heads WHERE team_heads.id = survey_projects.team_head_id AND team_heads.user_id = auth.uid()));

-- enumerators: team head access
DROP POLICY IF EXISTS "select_project_enumerators" ON enumerators;
CREATE POLICY "select_project_enumerators" ON enumerators FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM survey_projects sp JOIN team_heads th ON sp.team_head_id = th.id WHERE sp.id = enumerators.project_id AND th.user_id = auth.uid()));
DROP POLICY IF EXISTS "insert_project_enumerators" ON enumerators;
CREATE POLICY "insert_project_enumerators" ON enumerators FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM survey_projects sp JOIN team_heads th ON sp.team_head_id = th.id WHERE sp.id = enumerators.project_id AND th.user_id = auth.uid()));
DROP POLICY IF EXISTS "update_project_enumerators" ON enumerators;
CREATE POLICY "update_project_enumerators" ON enumerators FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM survey_projects sp JOIN team_heads th ON sp.team_head_id = th.id WHERE sp.id = enumerators.project_id AND th.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM survey_projects sp JOIN team_heads th ON sp.team_head_id = th.id WHERE sp.id = enumerators.project_id AND th.user_id = auth.uid()));

-- survey_rooms: team head access
DROP POLICY IF EXISTS "select_own_rooms" ON survey_rooms;
CREATE POLICY "select_own_rooms" ON survey_rooms FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM survey_projects sp JOIN team_heads th ON sp.team_head_id = th.id WHERE sp.id = survey_rooms.project_id AND th.user_id = auth.uid()));
DROP POLICY IF EXISTS "insert_own_rooms" ON survey_rooms;
CREATE POLICY "insert_own_rooms" ON survey_rooms FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM survey_projects sp JOIN team_heads th ON sp.team_head_id = th.id WHERE sp.id = survey_rooms.project_id AND th.user_id = auth.uid()));
DROP POLICY IF EXISTS "update_own_rooms" ON survey_rooms;
CREATE POLICY "update_own_rooms" ON survey_rooms FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM survey_projects sp JOIN team_heads th ON sp.team_head_id = th.id WHERE sp.id = survey_rooms.project_id AND th.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM survey_projects sp JOIN team_heads th ON sp.team_head_id = th.id WHERE sp.id = survey_rooms.project_id AND th.user_id = auth.uid()));

-- survey_slots: team head access
DROP POLICY IF EXISTS "select_project_slots" ON survey_slots;
CREATE POLICY "select_project_slots" ON survey_slots FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM survey_projects sp JOIN team_heads th ON sp.team_head_id = th.id WHERE sp.id = survey_slots.project_id AND th.user_id = auth.uid()));
DROP POLICY IF EXISTS "insert_project_slots" ON survey_slots;
CREATE POLICY "insert_project_slots" ON survey_slots FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM survey_projects sp JOIN team_heads th ON sp.team_head_id = th.id WHERE sp.id = survey_slots.project_id AND th.user_id = auth.uid()));
DROP POLICY IF EXISTS "update_project_slots" ON survey_slots;
CREATE POLICY "update_project_slots" ON survey_slots FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM survey_projects sp JOIN team_heads th ON sp.team_head_id = th.id WHERE sp.id = survey_slots.project_id AND th.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM survey_projects sp JOIN team_heads th ON sp.team_head_id = th.id WHERE sp.id = survey_slots.project_id AND th.user_id = auth.uid()));

-- vehicle_captures: team head access
DROP POLICY IF EXISTS "select_project_captures" ON vehicle_captures;
CREATE POLICY "select_project_captures" ON vehicle_captures FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM survey_projects sp JOIN team_heads th ON sp.team_head_id = th.id WHERE sp.id = vehicle_captures.project_id AND th.user_id = auth.uid()));
DROP POLICY IF EXISTS "insert_project_captures" ON vehicle_captures;
CREATE POLICY "insert_project_captures" ON vehicle_captures FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM survey_projects sp JOIN team_heads th ON sp.team_head_id = th.id WHERE sp.id = vehicle_captures.project_id AND th.user_id = auth.uid()));
DROP POLICY IF EXISTS "update_project_captures" ON vehicle_captures;
CREATE POLICY "update_project_captures" ON vehicle_captures FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM survey_projects sp JOIN team_heads th ON sp.team_head_id = th.id WHERE sp.id = vehicle_captures.project_id AND th.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM survey_projects sp JOIN team_heads th ON sp.team_head_id = th.id WHERE sp.id = vehicle_captures.project_id AND th.user_id = auth.uid()));

-- vehicle_counts: team head access
DROP POLICY IF EXISTS "select_project_counts" ON vehicle_counts;
CREATE POLICY "select_project_counts" ON vehicle_counts FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM survey_projects sp JOIN team_heads th ON sp.team_head_id = th.id WHERE sp.id = vehicle_counts.project_id AND th.user_id = auth.uid()));
DROP POLICY IF EXISTS "insert_project_counts" ON vehicle_counts;
CREATE POLICY "insert_project_counts" ON vehicle_counts FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM survey_projects sp JOIN team_heads th ON sp.team_head_id = th.id WHERE sp.id = vehicle_counts.project_id AND th.user_id = auth.uid()));
DROP POLICY IF EXISTS "update_project_counts" ON vehicle_counts;
CREATE POLICY "update_project_counts" ON vehicle_counts FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM survey_projects sp JOIN team_heads th ON sp.team_head_id = th.id WHERE sp.id = vehicle_counts.project_id AND th.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM survey_projects sp JOIN team_heads th ON sp.team_head_id = th.id WHERE sp.id = vehicle_counts.project_id AND th.user_id = auth.uid()));

-- chat_messages: team head access
DROP POLICY IF EXISTS "select_room_messages" ON chat_messages;
CREATE POLICY "select_room_messages" ON chat_messages FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM survey_rooms sr JOIN survey_projects sp ON sr.project_id = sp.id JOIN team_heads th ON sp.team_head_id = th.id WHERE sr.id = chat_messages.room_id AND th.user_id = auth.uid()));
DROP POLICY IF EXISTS "insert_room_messages" ON chat_messages;
CREATE POLICY "insert_room_messages" ON chat_messages FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM survey_rooms sr JOIN survey_projects sp ON sr.project_id = sp.id JOIN team_heads th ON sp.team_head_id = th.id WHERE sr.id = chat_messages.room_id AND th.user_id = auth.uid()));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_survey_projects_team_head ON survey_projects(team_head_id);
CREATE INDEX IF NOT EXISTS idx_survey_slots_project ON survey_slots(project_id);
CREATE INDEX IF NOT EXISTS idx_enumerators_project ON enumerators(project_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_captures_project ON vehicle_captures(project_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_captures_enumerator ON vehicle_captures(enumerator_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_captures_slot ON vehicle_captures(slot_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_counts_project ON vehicle_counts(project_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_room ON chat_messages(room_id);
CREATE INDEX IF NOT EXISTS idx_survey_rooms_project ON survey_rooms(project_id);
