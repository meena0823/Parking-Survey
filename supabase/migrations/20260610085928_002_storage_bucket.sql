/*
# Create survey images storage bucket
- Create storage bucket "survey-images" for vehicle capture images.
- Set public access to false (authenticated only).
- Add CRUD policies for authenticated users.
*/

INSERT INTO storage.buckets (id, name, public) 
VALUES ('survey-images', 'survey-images', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "upload_survey_images" ON storage.objects;
CREATE POLICY "upload_survey_images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'survey-images');

DROP POLICY IF EXISTS "read_survey_images" ON storage.objects;
CREATE POLICY "read_survey_images" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'survey-images');

DROP POLICY IF EXISTS "update_survey_images" ON storage.objects;
CREATE POLICY "update_survey_images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'survey-images') WITH CHECK (bucket_id = 'survey-images');

DROP POLICY IF EXISTS "delete_survey_images" ON storage.objects;
CREATE POLICY "delete_survey_images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'survey-images');
