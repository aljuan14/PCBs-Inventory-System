-- History of check-result messages sent to companies. The admin copies the
-- message from the company card, emails it, then marks it as sent here. The
-- company status (not sent / sent / new data since) is derived from this
-- table and the import dates.

CREATE TABLE IF NOT EXISTS public.company_feedback_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Account that marked it, taken from the login token rather than the client.
    sent_by TEXT DEFAULT (auth.jwt() ->> 'email'),
    -- What the message covered at the time.
    findings INTEGER NOT NULL DEFAULT 0,
    imported_rows INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_company_feedback_log_company ON public.company_feedback_log (company_id, sent_at DESC);

ALTER TABLE public.company_feedback_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated full access on company_feedback_log" ON public.company_feedback_log;
CREATE POLICY "Authenticated full access on company_feedback_log" ON public.company_feedback_log
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_feedback_log TO authenticated;
