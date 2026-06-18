-- Allow unauthenticated (anon) users to look up active survey rooms by room_code
-- and to self-register as enumerators. These are public-join flows without auth accounts.

-- survey_rooms: allow anon SELECT (to look up by room_code)
DROP POLICY IF EXISTS "anon_select_rooms_by_code" ON survey_rooms;
CREATE POLICY "anon_select_rooms_by_code" ON survey_rooms FOR SELECT TO anon USING (is_active = true);

-- survey_projects: allow anon SELECT (needed for the join on rooms → projects)
DROP POLICY IF EXISTS "anon_select_projects_via_room" ON survey_projects;
CREATE POLICY "anon_select_projects_via_room" ON survey_projects FOR SELECT TO anon USING (true);

-- survey_slots: allow anon SELECT (enumerator needs to know slots)
DROP POLICY IF EXISTS "anon_select_slots" ON survey_slots;
CREATE POLICY "anon_select_slots" ON survey_slots FOR SELECT TO anon USING (true);

-- enumerators: allow anon INSERT (self-registration via room code)
DROP POLICY IF EXISTS "anon_insert_enumerator" ON enumerators;
CREATE POLICY "anon_insert_enumerator" ON enumerators FOR INSERT TO anon WITH CHECK (true);

-- enumerators: allow anon SELECT (enumerator reads own data after joining)
DROP POLICY IF EXISTS "anon_select_enumerator" ON enumerators;
CREATE POLICY "anon_select_enumerator" ON enumerators FOR SELECT TO anon USING (true);

-- enumerators: allow anon UPDATE (heartbeat, GPS, online status updates)
DROP POLICY IF EXISTS "anon_update_enumerator" ON enumerators;
CREATE POLICY "anon_update_enumerator" ON enumerators FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- vehicle_captures: allow anon INSERT (enumerator submits captures)
DROP POLICY IF EXISTS "anon_insert_captures" ON vehicle_captures;
CREATE POLICY "anon_insert_captures" ON vehicle_captures FOR INSERT TO anon WITH CHECK (true);

-- vehicle_captures: allow anon SELECT (enumerator reads own captures)
DROP POLICY IF EXISTS "anon_select_captures" ON vehicle_captures;
CREATE POLICY "anon_select_captures" ON vehicle_captures FOR SELECT TO anon USING (true);

-- vehicle_counts: allow anon INSERT/UPDATE (enumerator upserts counts)
DROP POLICY IF EXISTS "anon_insert_counts" ON vehicle_counts;
CREATE POLICY "anon_insert_counts" ON vehicle_counts FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_counts" ON vehicle_counts;
CREATE POLICY "anon_update_counts" ON vehicle_counts FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_select_counts" ON vehicle_counts;
CREATE POLICY "anon_select_counts" ON vehicle_counts FOR SELECT TO anon USING (true);

-- chat_messages: allow anon INSERT/SELECT (enumerator participates in chat)
DROP POLICY IF EXISTS "anon_insert_messages" ON chat_messages;
CREATE POLICY "anon_insert_messages" ON chat_messages FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon_select_messages" ON chat_messages;
CREATE POLICY "anon_select_messages" ON chat_messages FOR SELECT TO anon USING (true);
