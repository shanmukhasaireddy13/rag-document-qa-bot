"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { Bot, User, FileText, ChevronDown, ChevronUp, Lock, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSharedChat, type SharedChat } from "@/lib/chat-history";

interface Source { document: string; snippet: string; score: number }

function ConfidenceBadge({ level }: { level: string }) {
  const map: Record<string, { bar: string; dot: string; label: string }> = {
    high:   { bar: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", dot: "bg-emerald-400", label: "High confidence" },
    medium: { bar: "bg-amber-500/15 text-amber-400 border-amber-500/30",       dot: "bg-amber-400",   label: "Medium confidence" },
    low:    { bar: "bg-red-500/15 text-red-400 border-red-500/30",             dot: "bg-red-400",     label: "Low confidence" },
  };
  const c = map[level] ?? map.low;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium", c.bar)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", c.dot)} />
      {c.label}
    </span>
  );
}

function SourceCard({ source }: { source: Source }) {
  const [open, setOpen] = React.useState(false);
  const pct = Math.round(source.score * 100);
  const pctColor = pct >= 68 ? "text-emerald-400" : pct >= 52 ? "text-amber-400" : "text-red-400";
  return (
    <div className="rounded-lg border border-white/8 bg-white/2 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-white/4 transition-colors"
      >
        <FileText className="h-3.5 w-3.5 shrink-0 text-white/25" />
        <span className="flex-1 truncate text-xs text-white/60 font-medium">{source.document}</span>
        <span className={cn("shrink-0 text-xs font-semibold", pctColor)}>{pct}%</span>
        {open ? <ChevronUp className="h-3 w-3 shrink-0 text-white/25" /> : <ChevronDown className="h-3 w-3 shrink-0 text-white/25" />}
      </button>
      {open && (
        <div className="border-t border-white/6 px-3 py-2.5">
          <p className="text-xs leading-relaxed text-white/45 italic">&ldquo;{source.snippet}&rdquo;</p>
        </div>
      )}
    </div>
  );
}

export default function SharePage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();

  const [chat,    setChat]    = React.useState<SharedChat | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error,   setError]   = React.useState(false);

  React.useEffect(() => {
    if (!id) return;
    getSharedChat(id).then((data) => {
      if (!data) setError(true);
      else setChat(data);
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white" />
      </div>
    );
  }

  if (error || !chat) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-5 bg-black text-center px-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
          <Lock className="h-6 w-6 text-white/30" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white/70">This chat is not available</p>
          <p className="mt-1 text-xs text-white/30">It may have been unshared or the link is invalid.</p>
        </div>
        <button
          onClick={() => router.push("/")}
          className="rounded-lg border border-white/10 px-4 py-2 text-xs text-white/45 hover:text-white/70 hover:border-white/20 transition-colors"
        >
          Go to FlashFetch
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-white/8 bg-black/80 backdrop-blur-md px-4 py-3">
        <div className="mx-auto max-w-3xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5">
              <Bot className="h-4 w-4 text-white/40" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white/80 leading-tight">{chat.title}</p>
              <p className="text-[10px] text-white/25">Shared conversation · {chat.messages.length} messages</p>
            </div>
          </div>
          <a
            href="/"
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/40 hover:text-white/70 hover:border-white/20 transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            FlashFetch
          </a>
        </div>
      </header>

      {/* Messages */}
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        {chat.messages.map((msg) => {
          const isUser    = msg.role === "user";
          const sources   = (msg.sources ?? []) as unknown as Source[];
          return (
            <div key={msg.msg_id} className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
              <div className={cn(
                "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border text-xs",
                isUser ? "border-white/15 bg-white/8" : "border-white/10 bg-[#111]",
              )}>
                {isUser ? <User className="h-4 w-4 text-white/60" /> : <Bot className="h-4 w-4 text-white/40" />}
              </div>

              <div className={cn("flex max-w-[75%] flex-col gap-2", isUser && "items-end")}>
                <div className={cn(
                  "rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap",
                  isUser
                    ? "rounded-tr-sm bg-white text-black font-medium"
                    : "rounded-tl-sm border border-white/8 bg-[#0f0f0f] text-white/85",
                )}>
                  {msg.content}
                </div>

                {!isUser && msg.confidence && (
                  <div className="flex flex-col gap-2 w-full">
                    <ConfidenceBadge level={msg.confidence} />
                    {sources.length > 0 && (
                      <>
                        <p className="text-[10px] font-semibold tracking-widest text-white/20 uppercase px-0.5">Sources</p>
                        <div className="flex flex-col gap-1.5">
                          {sources.map((s, i) => <SourceCard key={i} source={s} />)}
                        </div>
                      </>
                    )}
                  </div>
                )}

                <p className="text-[10px] text-white/20">
                  {new Date(msg.created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/8 py-6 text-center">
        <p className="text-xs text-white/25">
          Read-only shared chat · Powered by{" "}
          <a href="/" className="text-white/45 underline underline-offset-2 hover:text-white/70">FlashFetch</a>
        </p>
      </footer>
    </div>
  );
}
