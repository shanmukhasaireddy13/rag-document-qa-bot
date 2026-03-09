"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Github, X, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

type View = "login" | "signup" | "forgot";

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function InputField({
  label,
  id,
  type = "text",
  placeholder,
  value,
  onChange,
  required,
}: {
  label: string;
  id: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  const [show, setShow] = React.useState(false);
  const isPassword = type === "password";

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold uppercase tracking-widest text-white/40">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={isPassword ? (show ? "text" : "password") : type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          className={cn(
            "w-full rounded-lg border border-white/10 bg-[#111] px-3 py-2.5 text-sm text-white",
            "placeholder:text-white/25",
            "focus:outline-none focus:ring-1 focus:ring-white/30",
            isPassword && "pr-10"
          )}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white"
            tabIndex={-1}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

function Divider() {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-white/8" />
      <span className="text-xs text-white/30">or continue with</span>
      <span className="h-px flex-1 bg-white/8" />
    </div>
  );
}

const btnBase = cn(
  "flex w-full items-center justify-center gap-3 rounded-lg border border-white/10 bg-white/3 px-4 py-2.5",
  "text-sm font-medium text-white/70 transition-colors",
  "hover:bg-white/8 hover:text-white",
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30",
  "disabled:pointer-events-none disabled:opacity-50"
);

const primaryBtn = cn(
  "flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5",
  "text-sm font-medium text-black transition-all hover:scale-[1.02] active:scale-95",
  "",
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30",
  "disabled:pointer-events-none disabled:opacity-60"
);

export function AuthModal({ open, onOpenChange, onSuccess }: AuthModalProps) {
  const router = useRouter();
  const [view, setView] = React.useState<View>("login");

  // login
  const [loginEmail, setLoginEmail] = React.useState("");
  const [loginPassword, setLoginPassword] = React.useState("");

  // signup
  const [signupName, setSignupName] = React.useState("");
  const [signupEmail, setSignupEmail] = React.useState("");
  const [signupPassword, setSignupPassword] = React.useState("");

  // forgot
  const [forgotEmail, setForgotEmail] = React.useState("");
  const [forgotSent, setForgotSent] = React.useState(false);

  const [oauthLoading, setOauthLoading] = React.useState<"google" | "github" | null>(null);
  const [formLoading, setFormLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");

  function resetState() {
    setError("");
    setSuccess("");
    setFormLoading(false);
    setForgotSent(false);
  }

  function switchView(v: View) {
    resetState();
    setView(v);
  }

  async function signInWithOAuth(provider: "google" | "github") {
    if (!isSupabaseConfigured) return;
    const supabase = createClient();
    if (!supabase) return;
    setOauthLoading(provider);
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/chat` },
    });
    setOauthLoading(null);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!isSupabaseConfigured) { setError("Supabase is not configured."); return; }
    const supabase = createClient();
    if (!supabase) return;
    setFormLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword });
    setFormLoading(false);
    if (error) { setError(error.message); return; }
    onOpenChange(false);
    onSuccess?.();
    router.push("/chat");
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!isSupabaseConfigured) { setError("Supabase is not configured."); return; }
    const supabase = createClient();
    if (!supabase) return;
    setFormLoading(true);
    const { error } = await supabase.auth.signUp({
      email: signupEmail,
      password: signupPassword,
      options: {
        data: { full_name: signupName },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/chat`,
      },
    });
    setFormLoading(false);
    if (error) { setError(error.message); return; }
    setSuccess("Check your email to confirm your account!");
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!isSupabaseConfigured) { setError("Supabase is not configured."); return; }
    const supabase = createClient();
    if (!supabase) return;
    setFormLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setFormLoading(false);
    if (error) { setError(error.message); return; }
    setForgotSent(true);
  }

  const titles: Record<View, { title: string; desc: string }> = {
    login: { title: "Welcome back", desc: "Sign in to your account" },
    signup: { title: "Create an account", desc: "Join the TopDevs community" },
    forgot: { title: "Reset password", desc: "We'll send a reset link to your email" },
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) resetState(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2",
            "rounded-2xl border border-white/10 bg-[#0a0a0a] p-8 shadow-2xl",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[state=closed]:slide-out-to-left-1/2 data-[state=open]:slide-in-from-left-1/2",
            "data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-top-[48%]"
          )}
        >
          {/* Close */}
          <Dialog.Close className="absolute right-4 top-4 rounded-sm text-white/30 transition-colors hover:text-white focus:outline-none">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Dialog.Close>

          {/* Back button for forgot view */}
          {view === "forgot" && (
            <button
              onClick={() => switchView("login")}
              className="absolute left-4 top-4 flex items-center gap-1 text-xs text-white/30 hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
          )}

          {/* Header */}
          <div className="mb-6 text-center">
            <Dialog.Title className="text-2xl font-semibold tracking-tight text-white" style={{ letterSpacing: "-0.04em" }}>
              {titles[view].title}
            </Dialog.Title>
            <Dialog.Description className="mt-1.5 text-sm text-white/40">
              {titles[view].desc}
            </Dialog.Description>
          </div>

          {/* Tab switcher — login / signup */}
          {view !== "forgot" && (
            <div className="mb-6 flex rounded-lg border border-white/10 bg-white/3 p-1">
              {(["login", "signup"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => switchView(v)}
                  className={cn(
                    "flex-1 rounded-md py-1.5 text-sm font-medium transition-all",
                    view === v
                      ? "bg-white text-black"
                      : "text-white/40 hover:text-white"
                  )}
                >
                  {v === "login" ? "Sign In" : "Sign Up"}
                </button>
              ))}
            </div>
          )}

          {/* Error / success */}
          {error && (
            <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}
          {success && (
            <p className="mb-4 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs text-green-600 dark:text-green-400">
              {success}
            </p>
          )}

          {/* ── LOGIN ── */}
          {view === "login" && (
            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <InputField label="Email" id="login-email" type="email" placeholder="you@example.com" value={loginEmail} onChange={setLoginEmail} required />
              <InputField label="Password" id="login-password" type="password" placeholder="Enter your password" value={loginPassword} onChange={setLoginPassword} required />

              <div className="flex justify-end">
                <button type="button" onClick={() => switchView("forgot")} className="text-xs text-white/30 underline-offset-4 hover:text-white hover:underline">
                  Forgot password?
                </button>
              </div>

              <button type="submit" disabled={formLoading} className={primaryBtn} style={{ background: 'linear-gradient(to bottom, #ffffff, rgba(255,255,255,0.78))' }}>
                {formLoading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
                Sign In
              </button>

              <Divider />

              <button type="button" onClick={() => signInWithOAuth("google")} disabled={oauthLoading !== null} className={btnBase}>
                {oauthLoading === "google" ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <GoogleIcon className="h-4 w-4 shrink-0" />}
                Continue with Google
              </button>
              <button type="button" onClick={() => signInWithOAuth("github")} disabled={oauthLoading !== null} className={btnBase}>
                {oauthLoading === "github" ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Github className="h-4 w-4 shrink-0" />}
                Continue with GitHub
              </button>
            </form>
          )}

          {/* ── SIGN UP ── */}
          {view === "signup" && (
            <form onSubmit={handleSignup} className="flex flex-col gap-4">
              <InputField label="Full name" id="signup-name" placeholder="Jane Doe" value={signupName} onChange={setSignupName} required />
              <InputField label="Email" id="signup-email" type="email" placeholder="you@example.com" value={signupEmail} onChange={setSignupEmail} required />
              <InputField label="Password" id="signup-password" type="password" placeholder="Min. 8 characters" value={signupPassword} onChange={setSignupPassword} required />

              <button type="submit" disabled={formLoading || !!success} className={primaryBtn} style={{ background: 'linear-gradient(to bottom, #ffffff, rgba(255,255,255,0.78))' }}>
                {formLoading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
                Create account
              </button>

              <Divider />

              <button type="button" onClick={() => signInWithOAuth("google")} disabled={oauthLoading !== null} className={btnBase}>
                {oauthLoading === "google" ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <GoogleIcon className="h-4 w-4 shrink-0" />}
                Continue with Google
              </button>
              <button type="button" onClick={() => signInWithOAuth("github")} disabled={oauthLoading !== null} className={btnBase}>
                {oauthLoading === "github" ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Github className="h-4 w-4 shrink-0" />}
                Continue with GitHub
              </button>
            </form>
          )}

          {/* ── FORGOT PASSWORD ── */}
          {view === "forgot" && (
            <form onSubmit={handleForgot} className="flex flex-col gap-4">
              {forgotSent ? (
                <p className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-3 text-sm text-green-600 dark:text-green-400">
                  ✓ Reset link sent — check your inbox.
                </p>
              ) : (
                <>
                  <InputField label="Email" id="forgot-email" type="email" placeholder="you@example.com" value={forgotEmail} onChange={setForgotEmail} required />
                  <button type="submit" disabled={formLoading} className={primaryBtn} style={{ background: 'linear-gradient(to bottom, #ffffff, rgba(255,255,255,0.78))' }}>
                    {formLoading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
                    Send reset link
                  </button>
                </>
              )}
            </form>
          )}

          <p className="mt-6 text-center text-xs text-white/25">
            By continuing, you agree to our{" "}
            <a href="#" className="underline underline-offset-4 text-white/40 hover:text-white">Terms</a>{" "}
            and{" "}
            <a href="#" className="underline underline-offset-4 text-white/40 hover:text-white">Privacy Policy</a>.
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

