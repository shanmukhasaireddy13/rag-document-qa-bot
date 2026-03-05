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
