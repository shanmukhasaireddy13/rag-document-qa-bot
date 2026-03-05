"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  BarChart2, Users, MessageSquare, FileText,
  TrendingUp, Shield, RefreshCw, Lock, AlertOctagon,
} from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  checkIsAdmin,
  fetchAdminStats,
  fetchTopDocuments,
  fetchDailyQueries,
  fetchRecentSessions,
  type AdminStats,
  type TopDocument,
  type DailyCount,
  type RecentSession,
} from "@/lib/admin";

// ── Stat card ─────────────────────────────────────────────
function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/8 bg-[#0a0a0a] p-5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-white/25">{label}</span>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/8 bg-white/3">
          <Icon className="h-4 w-4 text-white/30" />
        </div>
      </div>
      <p className="text-3xl font-bold tracking-tight text-white">{value}</p>
      {sub && <p className="text-xs text-white/25">{sub}</p>}
    </div>
  );
}

// ── Bar chart (CSS only, monochrome) ──────────────────────
function BarChart({ data }: { data: DailyCount[] }) {
  if (!data.length) {
    return <p className="py-10 text-center text-xs text-white/20">No data yet</p>;
  }
  const max = Math.max(...data.map((d) => d.query_count), 1);
  return (
    <div className="flex h-28 w-full items-end gap-0.75">
      {data.map((d) => {
        const pct    = Math.max((d.query_count / max) * 100, 3);
        const label  = new Date(d.day).toLocaleDateString(undefined, { month: "short", day: "numeric" });
        return (
          <div key={d.day} className="group relative flex flex-1 flex-col items-center">
            <div
              className="w-full rounded-t-[2px] bg-white/20 group-hover:bg-white/40 transition-colors"
              style={{ height: `${pct}%` }}
            />
            {/* Tooltip */}
            <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:flex whitespace-nowrap rounded border border-white/10 bg-[#111] px-2 py-1 text-[10px] text-white/60 z-10">
              {label}: {d.query_count}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Confidence bars (monochrome) ──────────────────────────
function ConfidenceBars({ stats }: { stats: AdminStats }) {
  const total = stats.high_confidence + stats.medium_confidence + stats.low_confidence || 1;
  const rows = [
    { label: "High",   value: stats.high_confidence,   opacity: "bg-white/70" },
    { label: "Medium", value: stats.medium_confidence, opacity: "bg-white/35" },
    { label: "Low",    value: stats.low_confidence,    opacity: "bg-white/15" },
  ];
  return (
    <div className="flex flex-col gap-3.5">
      {rows.map((r) => {
        const pct = Math.round((r.value / total) * 100);
        return (
          <div key={r.label} className="flex items-center gap-3">
            <span className="w-14 shrink-0 text-xs text-white/35">{r.label}</span>
            <div className="flex-1 h-1.5 rounded-full bg-white/6 overflow-hidden">
              <div className={cn("h-full rounded-full", r.opacity)} style={{ width: `${pct}%` }} />
            </div>
            <span className="w-9 text-right text-xs font-semibold text-white/50 tabular-nums">{pct}%</span>
            <span className="w-7 text-right text-[11px] text-white/20 tabular-nums">{r.value}</span>
          </div>
        );
      })}
      {/* Mini legend */}
      <div className="mt-1 grid grid-cols-3 gap-2 text-center">
        {rows.map((r) => (
          <div key={r.label} className="rounded-lg border border-white/6 bg-white/2 py-2.5">
            <p className="text-sm font-bold text-white">{r.value}</p>
            <p className="text-[10px] text-white/25 mt-0.5">{r.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Admin Page ─────────────────────────────────────────────
export default function AdminPage() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = React.useState(false);
  const [isAdmin,     setIsAdmin]     = React.useState(false);
  const [user,        setUser]        = React.useState<any>(null);
  const [loading,     setLoading]     = React.useState(true);
  const [refreshing,  setRefreshing]  = React.useState(false);

  const [stats,    setStats]    = React.useState<AdminStats | null>(null);
  const [topDocs,  setTopDocs]  = React.useState<TopDocument[]>([]);
  const [daily,    setDaily]    = React.useState<DailyCount[]>([]);
  const [sessions, setSessions] = React.useState<RecentSession[]>([]);

  // ── Auth + admin check ──────────────────────────────────
  React.useEffect(() => {
    if (!isSupabaseConfigured) { setAuthChecked(true); setLoading(false); return; }
    const supabase = createClient();
    if (!supabase)              { setAuthChecked(true); setLoading(false); return; }
    supabase.auth.getUser().then(async ({ data }) => {
      setAuthChecked(true);
      if (!data.user) { setLoading(false); return; }
      setUser(data.user);
      const admin = await checkIsAdmin();
      setIsAdmin(admin);
      if (admin) await loadAll();
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    const [s, d, q, r] = await Promise.all([
      fetchAdminStats(),
      fetchTopDocuments(),
      fetchDailyQueries(),
      fetchRecentSessions(20),
    ]);
    setStats(s);
    setTopDocs(d);
    setDaily(q);
    setSessions(r);
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }

  async function signInWithGoogle() {
    const supabase = createClient();
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/admin` },
    });
  }

  // ── Loading ─────────────────────────────────────────────
  if (!authChecked || loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/10 border-t-white/60" />
      </div>
    );
  }

  // ── Not signed in ───────────────────────────────────────
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0a0a0a] p-8 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/4">
            <Lock className="h-6 w-6 text-white/35" />
          </div>
          <h1 className="mb-1.5 text-base font-semibold text-white">Admin Portal</h1>
          <p className="mb-6 text-sm text-white/35">Sign in to access the analytics dashboard.</p>
          <button
            onClick={signInWithGoogle}
            className="w-full rounded-xl bg-white py-2.5 text-sm font-semibold text-black hover:bg-white/90 transition-colors"
          >
            Sign in with Google
          </button>
          <button
            onClick={() => router.push("/")}
            className="mt-3 w-full rounded-xl border border-white/8 py-2.5 text-sm text-white/30 hover:text-white/60 transition-colors"
          >
            Back to home
          </button>
        </div>
      </div>
    );
  }

  // ── Signed in but not admin ─────────────────────────────
  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0a0a0a] p-8 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/8 bg-white/3">
            <AlertOctagon className="h-6 w-6 text-white/35" />
          </div>
          <h1 className="mb-1.5 text-base font-semibold text-white">Access Denied</h1>
          <p className="mb-1 text-sm text-white/40">You don&apos;t have admin access.</p>
          <p className="mb-6 text-xs text-white/20">
            Signed in as <span className="text-white/40">{user.email}</span>
          </p>
          <button
            onClick={() => router.push("/")}
            className="w-full rounded-xl border border-white/8 py-2.5 text-sm text-white/40 hover:text-white/70 transition-colors"
          >
            Back to home
          </button>
        </div>
      </div>
    );
  }

  // ── Weighted avg confidence score ────────────────────────
  const totalAnswers  = (stats?.high_confidence ?? 0) + (stats?.medium_confidence ?? 0) + (stats?.low_confidence ?? 0) || 1;
  const avgConfScore  = stats
    ? Math.round(((stats.high_confidence * 1 + stats.medium_confidence * 0.6 + stats.low_confidence * 0.2) / totalAnswers) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-black text-white">

      {/* ── Header ────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-white/8 bg-black/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/4">
              <Shield className="h-4 w-4 text-white/40" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-white">Admin Portal</h1>
              <p className="text-[10px] text-white/25">FlashFetch Analytics</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-white/25 sm:block">{user.email}</span>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 rounded-lg border border-white/8 px-3 py-1.5 text-xs text-white/35 hover:text-white/65 hover:border-white/16 transition-colors disabled:opacity-30"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
              Refresh
            </button>
            <button
              onClick={() => router.push("/")}
              className="rounded-lg border border-white/8 px-3 py-1.5 text-xs text-white/35 hover:text-white/65 transition-colors"
            >
              ← Home
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10 space-y-10">

        {/* ── Overview ──────────────────────────────────── */}
        <section>
          <p className="mb-5 text-[10px] font-semibold uppercase tracking-widest text-white/25">Overview</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={MessageSquare} label="Total Queries"  value={(stats?.total_queries  ?? 0).toLocaleString()} sub="User messages sent" />
            <StatCard icon={Users}         label="Unique Users"   value={(stats?.total_users    ?? 0).toLocaleString()} sub="Distinct accounts" />
            <StatCard icon={BarChart2}     label="Sessions"       value={(stats?.total_sessions ?? 0).toLocaleString()} sub="Conversation sessions" />
            <StatCard icon={TrendingUp}    label="Avg Confidence" value={`${avgConfScore}%`}                            sub="Weighted score" />
          </div>
        </section>

        {/* ── Chart row ─────────────────────────────────── */}
        <section className="grid gap-6 lg:grid-cols-2">

          {/* Daily volume chart */}
          <div className="rounded-xl border border-white/8 bg-[#0a0a0a] p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Queries — Last 14 Days</h2>
              <span className="text-xs text-white/20">{daily.reduce((a, d) => a + d.query_count, 0)} total</span>
            </div>
            <BarChart data={daily} />
            {daily.length > 0 && (
              <div className="mt-2 flex justify-between text-[10px] text-white/15">
                <span>{new Date(daily[0].day).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                <span>{new Date(daily[daily.length - 1].day).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
              </div>
            )}
          </div>

          {/* Confidence breakdown */}
          <div className="rounded-xl border border-white/8 bg-[#0a0a0a] p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Confidence Breakdown</h2>
              <span className="text-xs text-white/20">{totalAnswers} answers</span>
            </div>
            {stats
              ? <ConfidenceBars stats={stats} />
              : <p className="py-10 text-center text-xs text-white/20">No data yet</p>
            }
          </div>
        </section>

        {/* ── Tables row ────────────────────────────────── */}
        <section className="grid gap-6 lg:grid-cols-2">

          {/* Most referenced documents */}
          <div className="rounded-xl border border-white/8 bg-[#0a0a0a] p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Most Referenced Docs</h2>
              <span className="text-xs text-white/20">Top 10</span>
            </div>
            {topDocs.length === 0 ? (
              <p className="py-10 text-center text-xs text-white/20">No document queries yet</p>
            ) : (
              <div className="space-y-2.5">
                {topDocs.map((d, i) => {
                  const maxHits = topDocs[0].hit_count || 1;
                  const pct     = Math.round((d.hit_count / maxHits) * 100);
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="w-4 shrink-0 text-right text-xs text-white/15 tabular-nums">{i + 1}</span>
                      <FileText className="h-3.5 w-3.5 shrink-0 text-white/15" />
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-xs text-white/60 font-medium">{d.document_name}</p>
                        <div className="mt-1 h-1 rounded-full bg-white/6 overflow-hidden">
                          <div className="h-full rounded-full bg-white/25" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-white/30 tabular-nums">{d.hit_count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent sessions */}
          <div className="rounded-xl border border-white/8 bg-[#0a0a0a] p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Recent Sessions</h2>
              <span className="text-xs text-white/20">Last 20</span>
            </div>
            {sessions.length === 0 ? (
              <p className="py-10 text-center text-xs text-white/20">No sessions yet</p>
            ) : (
              <div className="max-h-72 space-y-0.5 overflow-y-auto pr-1">
                {sessions.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/4 transition-colors">
                    <MessageSquare className="h-3.5 w-3.5 shrink-0 text-white/12" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-xs text-white/55 font-medium">{s.title}</p>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span className="text-[10px] text-white/20">
                          {new Date(s.created_at).toLocaleString(undefined, {
                            month: "short", day: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </span>
                        <span className="text-white/10">·</span>
                        <span className="font-mono text-[9px] text-white/15 truncate max-w-20" title={s.user_id}>
                          {s.user_id.slice(0, 8)}…
                        </span>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full border border-white/8 px-2 py-0.5 text-[10px] text-white/25 tabular-nums">
                      {s.message_count} msgs
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── How to grant admin access ──────────────────── */}
        <section className="rounded-xl border border-white/8 bg-[#0a0a0a] p-6">
          <div className="flex items-start gap-3">
            <Shield className="mt-0.5 h-4 w-4 shrink-0 text-white/30" />
            <div className="space-y-2">
              <p className="text-sm font-semibold text-white">How to grant admin access</p>
              <p className="text-xs text-white/35">
                Go to Supabase → SQL Editor and run this with the target user&apos;s UID:
              </p>
              <pre className="rounded-lg border border-white/8 bg-black px-4 py-3 text-xs text-white/50 font-mono leading-relaxed overflow-x-auto">
                {`INSERT INTO public.admin_users (user_id)\nVALUES ('<paste auth.uid() here>');`}
              </pre>
              <p className="text-[11px] text-white/25">
                Find the UID in Supabase → Authentication → Users table.
              </p>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
