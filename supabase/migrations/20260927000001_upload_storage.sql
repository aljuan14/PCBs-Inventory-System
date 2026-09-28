-- Move the upload working files off the local disk (tmp_uploads/), which does
-- not survive on serverless hosts. The workbook goes to Supabase Storage (the
-- browser uploads it directly, so large PLN files bypass request body limits),
-- the scan result to upload_sessions, and each batch's mapping context to
-- import_batches.

-- Private bucket for uploaded workbooks: uploads/<upload_id>/source.<ext>
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'pcbs-files', 'pcbs-files', false, 52428800,
    ARRAY[
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'application/octet-stream'
    ]
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Same open access as the inventory tables until authentication is added.
DROP POLICY IF EXISTS "Public full access on pcbs-files" ON storage.objects;
CREATE POLICY "Public full access on pcbs-files" ON storage.objects
    FOR ALL USING (bucket_id = 'pcbs-files') WITH CHECK (bucket_id = 'pcbs-files');

-- One row per uploaded workbook. `sheets` holds the scan the admin reviews
-- before choosing which sheets become import batches.
CREATE TABLE IF NOT EXISTS public.upload_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'scanned')),
    sheets JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_upload_sessions_created ON public.upload_sessions (created_at);

ALTER TABLE public.upload_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access on upload_sessions" ON public.upload_sessions;
CREATE POLICY "Public full access on upload_sessions" ON public.upload_sessions FOR ALL USING (true) WITH CHECK (true);

-- Mapping context per batch (previously <batchId>.json on disk).
ALTER TABLE public.import_batches
    ADD COLUMN IF NOT EXISTS upload_id UUID REFERENCES public.upload_sessions (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS sheet_name TEXT,
    ADD COLUMN IF NOT EXISTS profile TEXT,
    ADD COLUMN IF NOT EXISTS headers JSONB,
    ADD COLUMN IF NOT EXISTS total_rows INTEGER,
    ADD COLUMN IF NOT EXISTS data_rows INTEGER,
    ADD COLUMN IF NOT EXISTS preview_rows JSONB,
    ADD COLUMN IF NOT EXISTS suggested_mapping JSONB;

CREATE INDEX IF NOT EXISTS idx_import_batches_upload ON public.import_batches (upload_id);
