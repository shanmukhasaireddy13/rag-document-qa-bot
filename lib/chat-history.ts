/**
 * lib/chat-history.ts
 * -------------------
 * Supabase helpers for persisting chat sessions and messages.
 * Gracefully degrades when Supabase is not configured.
 */

import { createClient } from "@/lib/supabase/client";

// ── Types ─────────────────────────────────────────────────
export interface ChatSession {
  id: string;
  title: string;
  created_at: string;
}

export interface HistoryMessage {
  id:         string;
  role:       "user" | "assistant";
  content:    string;
  sources:    Record<string, unknown>[];
  confidence: string | null;
  created_at: string;
}

// ── Sessions ──────────────────────────────────────────────

export async function createSession(userId: string): Promise<string | null> {
  const supabase = createClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("chat_sessions")
    .insert({ user_id: userId, title: "New Chat" })
    .select("id")
    .single();
  if (error) { console.warn("[chat-history] createSession:", error.message); return null; }
  return data.id as string;
}

export async function loadSessions(userId: string): Promise<ChatSession[]> {
  const supabase = createClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("chat_sessions")
    .select("id, title, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) { console.warn("[chat-history] loadSessions:", error.message); return []; }
  return (data ?? []) as ChatSession[];
}

export async function deleteSession(sessionId: string): Promise<void> {
  const supabase = createClient();
  if (!supabase) return;
  await supabase.from("chat_sessions").delete().eq("id", sessionId);
}

export async function updateSessionTitle(sessionId: string, title: string): Promise<void> {
  const supabase = createClient();
  if (!supabase) return;
  await supabase
    .from("chat_sessions")
    .update({ title: title.slice(0, 80) })
    .eq("id", sessionId);
}

// ── Messages ──────────────────────────────────────────────

export async function loadMessages(sessionId: string): Promise<HistoryMessage[]> {
  const supabase = createClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, role, content, sources, confidence, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) { console.warn("[chat-history] loadMessages:", error.message); return []; }
  return (data ?? []) as HistoryMessage[];
}

export async function saveMessage(
  sessionId: string,
  userId:    string,
  role:      "user" | "assistant",
  content:   string,
  sources:   Record<string, unknown>[] = [],
  confidence: string | null = null,
): Promise<void> {
  const supabase = createClient();
  if (!supabase) return;
  const { error } = await supabase.from("chat_messages").insert({
    session_id: sessionId,
    user_id:    userId,
    role,
    content,
    sources,
    confidence,
  });
  if (error) console.warn("[chat-history] saveMessage:", error.message);
}

// ── Search ────────────────────────────────────────────────

export interface SearchResult {
  session_id:    string;
  session_title: string;
  message_id:    string;
  content:       string;
  role:          string;
  created_at:    string;
}

export async function searchChatHistory(
  userId: string,
  query:  string,
): Promise<SearchResult[]> {
  const supabase = createClient();
  if (!supabase || !query.trim()) return [];
  const { data, error } = await supabase.rpc("search_chat_history", {
    p_user_id: userId,
    p_query:   query.trim(),
    p_limit:   15,
  });
  if (error) { console.warn("[chat-history] search:", error.message); return []; }
  return (data ?? []) as SearchResult[];
}

// ── Share ─────────────────────────────────────────────────

export async function shareSession(sessionId: string): Promise<boolean> {
  const supabase = createClient();
  if (!supabase) return false;
  const { error } = await supabase
    .from("session_shares")
    .upsert({ session_id: sessionId });
  if (error) { console.warn("[chat-history] share:", error.message); return false; }
  return true;
}

export async function unshareSession(sessionId: string): Promise<void> {
  const supabase = createClient();
  if (!supabase) return;
  await supabase.from("session_shares").delete().eq("session_id", sessionId);
}

export async function isSessionShared(sessionId: string): Promise<boolean> {
  const supabase = createClient();
  if (!supabase) return false;
  const { data } = await supabase
    .from("session_shares")
    .select("session_id")
    .eq("session_id", sessionId)
    .maybeSingle();
  return !!data;
}

// ── Public share page data ────────────────────────────────

export interface SharedMessage {
  msg_id:        string;
  role:          string;
  content:       string;
  sources:       Record<string, unknown>[];
  confidence:    string | null;
  created_at:    string;
}

export interface SharedChat {
  title:    string;
  messages: SharedMessage[];
}

export async function getSharedChat(sessionId: string): Promise<SharedChat | null> {
  const supabase = createClient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("get_shared_chat", {
    p_session_id: sessionId,
  });
  if (error || !data || data.length === 0) return null;
  return {
    title:    data[0].session_title as string,
    messages: data.map((r: any) => ({
      msg_id:     r.msg_id,
      role:       r.role,
      content:    r.content,
      sources:    r.sources ?? [],
      confidence: r.confidence ?? null,
      created_at: r.created_at,
    })),
  };
}
