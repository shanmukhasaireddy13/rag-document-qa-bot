-- ============================================================
-- Chat History Tables for RAG Document QA Bot
-- Run this in your Supabase SQL Editor (project dashboard → SQL)
-- ============================================================

-- 1. Sessions table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL,
  title      TEXT NOT NULL DEFAULT 'New Chat',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Messages table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content    TEXT NOT NULL,
  sources    JSONB NOT NULL DEFAULT '[]',
  confidence TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Indexes ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON public.chat_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON public.chat_messages(session_id, created_at ASC);

-- 4. Enable RLS ──────────────────────────────────────────────
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies ────────────────────────────────────────────
-- Sessions: users only see/edit their own
DROP POLICY IF EXISTS "users_own_sessions" ON public.chat_sessions;
CREATE POLICY "users_own_sessions" ON public.chat_sessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Messages: users only see/edit their own
DROP POLICY IF EXISTS "users_own_messages" ON public.chat_messages;
CREATE POLICY "users_own_messages" ON public.chat_messages
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 6. Session shares (public read-only chat links)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.session_shares (
  session_id UUID PRIMARY KEY REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  shared_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.session_shares ENABLE ROW LEVEL SECURITY;

-- Anyone (anon) can see the share record
DROP POLICY IF EXISTS "public_read_shares" ON public.session_shares;
CREATE POLICY "public_read_shares" ON public.session_shares
  FOR SELECT USING (true);

-- Only the session owner can insert / delete
DROP POLICY IF EXISTS "owner_manage_shares" ON public.session_shares;
CREATE POLICY "owner_manage_shares" ON public.session_shares
  FOR ALL USING (
    auth.uid() = (SELECT user_id FROM public.chat_sessions WHERE id = session_id)
  ) WITH CHECK (
    auth.uid() = (SELECT user_id FROM public.chat_sessions WHERE id = session_id)
  );

-- ============================================================
-- 7. search_chat_history RPC
--    Full-text search across a user's messages; returns
--    session + snippet for each hit so the UI can jump to it.
-- ============================================================
CREATE OR REPLACE FUNCTION public.search_chat_history(
  p_user_id UUID,
  p_query   TEXT,
  p_limit   INT DEFAULT 15
)
RETURNS TABLE (
  session_id    UUID,
  session_title TEXT,
  message_id    UUID,
  content       TEXT,
  role          TEXT,
  created_at    TIMESTAMPTZ
)
LANGUAGE sql STABLE
AS $$
  SELECT
    s.id         AS session_id,
    s.title      AS session_title,
    m.id         AS message_id,
    m.content,
    m.role,
    m.created_at
  FROM public.chat_messages m
  JOIN public.chat_sessions s ON s.id = m.session_id
  WHERE s.user_id = p_user_id
    AND m.content ILIKE '%' || p_query || '%'
  ORDER BY m.created_at DESC
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.search_chat_history(UUID, TEXT, INT) TO authenticated;

-- ============================================================
-- 8. get_shared_chat RPC
--    Returns all messages for a session only if it is listed
--    in session_shares.  SECURITY DEFINER bypasses RLS so an
--    unauthenticated visitor can read a shared session.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_shared_chat(p_session_id UUID)
RETURNS TABLE (
  session_title TEXT,
  msg_id        UUID,
  role          TEXT,
  content       TEXT,
  sources       JSONB,
  confidence    TEXT,
  created_at    TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT
    s.title        AS session_title,
    m.id           AS msg_id,
    m.role,
    m.content,
    m.sources,
    m.confidence,
    m.created_at
  FROM public.chat_messages m
  JOIN public.chat_sessions s ON s.id = m.session_id
  WHERE m.session_id = p_session_id
    AND EXISTS (
      SELECT 1 FROM public.session_shares ss
      WHERE ss.session_id = p_session_id
    )
  ORDER BY m.created_at ASC;
$$;
GRANT EXECUTE ON FUNCTION public.get_shared_chat(UUID) TO anon, authenticated;
