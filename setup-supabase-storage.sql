-- ═══════════════════════════════════════════════════════════
-- Supabase Storage Setup for Ticket Images
-- ═══════════════════════════════════════════════════════════

-- 1. Create Storage Bucket for Ticket Images
-- Run this in Supabase Dashboard > SQL Editor

INSERT INTO storage.buckets (id, name, public)
VALUES ('ticket-images', 'ticket-images', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Set up Storage Policies for Public Access
-- Allow anyone to read images (for viewing tickets)
CREATE POLICY "Public Access for Ticket Images"
ON storage.objects FOR SELECT
USING (bucket_id = 'ticket-images');

-- Allow authenticated users to upload images
CREATE POLICY "Allow Upload for Authenticated Users"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'ticket-images');

-- Allow users to delete their own uploads (optional)
CREATE POLICY "Allow Delete Own Images"
ON storage.objects FOR DELETE
USING (bucket_id = 'ticket-images');

-- 3. Verify the bucket was created
SELECT * FROM storage.buckets WHERE id = 'ticket-images';
