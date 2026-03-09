  -- ============================================================
  -- Admin Portal Tables for FlashFetch
  -- Run this in your Supabase SQL Editor AFTER chat-history.sql
  -- ============================================================

  -- 1. Admin users table ───────────────────────────────────────
  --    To grant admin: INSERT INTO public.admin_users (user_id) VALUES ('<your-auth-uid>');
  --    To revoke:      DELETE FROM public.admin_users WHERE user_id = '<uid>';
  CREATE TABLE IF NOT EXISTS public.admin_users (
    user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- 2. RLS: Only the row's own user can read their admin_users entry
  ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "admins_read_own" ON public.admin_users;
  CREATE POLICY "admins_read_own" ON public.admin_users
    FOR SELECT USING (auth.uid() = user_id);

  -- 3. Analytics view ──────────────────────────────────────────
  --    Gives admins a single view to query from the dashboard.
  DROP VIEW IF EXISTS public.admin_analytics;
  CREATE VIEW public.admin_analytics AS
  SELECT
    -- total sessions
    (SELECT COUNT(*) FROM public.chat_sessions)                              AS total_sessions,
    -- total queries (user messages only)
    (SELECT COUNT(*) FROM public.chat_messages WHERE role = 'user')          AS total_queries,
    -- confidence counts
    (SELECT COUNT(*) FROM public.chat_messages WHERE role = 'assistant' AND confidence = 'high')   AS high_confidence,
    (SELECT COUNT(*) FROM public.chat_messages WHERE role = 'assistant' AND confidence = 'medium') AS medium_confidence,
    (SELECT COUNT(*) FROM public.chat_messages WHERE role = 'assistant' AND confidence = 'low')    AS low_confidence,
    -- distinct users
    (SELECT COUNT(DISTINCT user_id) FROM public.chat_sessions)               AS total_users;

  -- 4. Top documents view ──────────────────────────────────────
  --    Unnests the sources JSONB array to count per-document hits.
  DROP VIEW IF EXISTS public.admin_top_documents;
  CREATE VIEW public.admin_top_documents AS
  SELECT
    src->>'document' AS document_name,
    COUNT(*)         AS hit_count
  FROM public.chat_messages,
      jsonb_array_elements(sources) AS src
  WHERE role = 'assistant'
    AND jsonb_array_length(sources) > 0
  GROUP BY 1
  ORDER BY 2 DESC
  LIMIT 10;

  -- 5. Daily query volume (last 14 days) ──────────────────────
  DROP VIEW IF EXISTS public.admin_daily_queries;
  CREATE VIEW public.admin_daily_queries AS
  SELECT
    DATE(created_at)::TEXT AS day,
    COUNT(*)               AS query_count
  FROM public.chat_messages
  WHERE role = 'user'
    AND created_at >= NOW() - INTERVAL '14 days'
  GROUP BY 1
  ORDER BY 1 ASC;

  -- 6. Restrict view access ────────────────────────────────────
  --    Views cannot have RLS directly (Supabase shows "UNRESTRICTED").
  --    Fix: revoke from anon, allow only authenticated, and wrap each
  --    in a SECURITY DEFINER function that checks admin status.

  -- Helper: is current user an admin?
  CREATE OR REPLACE FUNCTION public.is_admin()
  RETURNS BOOLEAN
  LANGUAGE sql SECURITY DEFINER STABLE
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
    );
  $$;

  -- Revoke direct view access from all roles.
  -- Access is only permitted through the admin-only SECURITY DEFINER RPCs below.
  REVOKE ALL ON public.admin_analytics     FROM anon, public, authenticated;
  REVOKE ALL ON public.admin_top_documents FROM anon, public, authenticated;
  REVOKE ALL ON public.admin_daily_queries FROM anon, public, authenticated;

  -- 7. Secure wrapper functions (SECURITY DEFINER = run as owner) ──
  --    These enforce the admin check at the database level.
  --    Call these instead of querying views directly in production.

  CREATE OR REPLACE FUNCTION public.get_admin_analytics()
  RETURNS SETOF public.admin_analytics
  LANGUAGE sql SECURITY DEFINER STABLE
  AS $$
    SELECT * FROM public.admin_analytics
    WHERE public.is_admin();
  $$;

  CREATE OR REPLACE FUNCTION public.get_admin_top_documents()
  RETURNS SETOF public.admin_top_documents
  LANGUAGE sql SECURITY DEFINER STABLE
  AS $$
    SELECT * FROM public.admin_top_documents
    WHERE public.is_admin();
  $$;

  CREATE OR REPLACE FUNCTION public.get_admin_daily_queries()
  RETURNS SETOF public.admin_daily_queries
  LANGUAGE sql SECURITY DEFINER STABLE
  AS $$
    SELECT * FROM public.admin_daily_queries
    WHERE public.is_admin();
  $$;

  GRANT EXECUTE ON FUNCTION public.get_admin_analytics()     TO authenticated;
  GRANT EXECUTE ON FUNCTION public.get_admin_top_documents() TO authenticated;
  GRANT EXECUTE ON FUNCTION public.get_admin_daily_queries() TO authenticated;

  -- 8. Allow admins to SELECT all rows in chat tables ──────────
  --    Without these policies the views only see the calling user's rows.
  --    With SECURITY DEFINER the functions run as postgres (bypasses RLS),
  --    but direct .from() calls need explicit admin-read policies.

  DROP POLICY IF EXISTS "admins_read_all_sessions" ON public.chat_sessions;
  CREATE POLICY "admins_read_all_sessions" ON public.chat_sessions
    FOR SELECT USING (public.is_admin());

  DROP POLICY IF EXISTS "admins_read_all_messages" ON public.chat_messages;
  CREATE POLICY "admins_read_all_messages" ON public.chat_messages
    FOR SELECT USING (public.is_admin());

  -- 9. get_all_sessions RPC ──────────────────────────────────────
  --    Returns all sessions across all users for the admin dashboard.
  --    SECURITY DEFINER ensures RLS is bypassed (runs as postgres).
  CREATE OR REPLACE FUNCTION public.get_all_sessions(row_limit INT DEFAULT 20)
  RETURNS TABLE (
    id           UUID,
    user_id      UUID,
    title        TEXT,
    created_at   TIMESTAMPTZ,
    message_count BIGINT
  )
  LANGUAGE sql SECURITY DEFINER STABLE
  AS $$
    SELECT
      s.id,
      s.user_id,
      s.title,
      s.created_at,
      COUNT(m.id) AS message_count
    FROM public.chat_sessions s
    LEFT JOIN public.chat_messages m ON m.session_id = s.id
    WHERE public.is_admin()
    GROUP BY s.id, s.user_id, s.title, s.created_at
    ORDER BY s.created_at DESC
    LIMIT row_limit;
  $$;

  GRANT EXECUTE ON FUNCTION public.get_all_sessions(INT) TO authenticated;
