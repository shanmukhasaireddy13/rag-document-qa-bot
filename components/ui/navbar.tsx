"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, X } from "lucide-react";
import { AuthModal } from "@/components/ui/auth-modal";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

const navLinks = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How It Works" },
  { href: "/team", label: "Team" },
];

export function Navbar() {
  const [authOpen, setAuthOpen] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [user, setUser] = React.useState<any>(null);
  const router = useRouter();

  React.useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = createClient();
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  function handleCTAClick() {
    if (user) router.push("/chat");
    else setAuthOpen(true);
  }

  return (
    <>
      <header className="fixed top-0 w-full z-50 border-b border-white/8 bg-black/80 backdrop-blur-md">
        <nav className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-md bg-white flex items-center justify-center">
                <span className="text-black text-xs font-black">FF</span>
              </div>
              <span className="text-base font-semibold text-white tracking-tight">FlashFetch</span>
            </Link>

            {/* Center links */}
            <div className="hidden md:flex items-center gap-8 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm text-white/60 hover:text-white transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>

            {/* Right actions */}
            <div className="hidden md:flex items-center gap-3">
              <button
                onClick={() => setAuthOpen(true)}
                className="text-sm text-white/60 hover:text-white transition-colors px-4 py-2"
              >
                Sign in
              </button>
              <button
                onClick={handleCTAClick}
                className="inline-flex items-center justify-center gap-2 rounded-md px-5 h-10 text-sm font-medium text-black transition-all hover:scale-105 active:scale-95"
                style={{
                  background: "linear-gradient(to bottom, #ffffff, rgba(255,255,255,0.88), rgba(255,255,255,0.7))",
                }}
              >
                Get Started
              </button>
            </div>

            {/* Mobile hamburger */}
            <button
              className="md:hidden text-white p-1"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </nav>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden bg-black/95 backdrop-blur-md border-t border-white/8">
            <div className="px-6 py-4 flex flex-col gap-3">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm text-white/60 hover:text-white transition-colors py-1.5"
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              <div className="flex flex-col gap-2 pt-3 border-t border-white/8">
                <button
                  onClick={() => { setAuthOpen(true); setMobileOpen(false); }}
                  className="text-sm text-white/60 hover:text-white transition-colors py-2 text-left"
                >
                  Sign in
                </button>
                <button
                  onClick={() => { handleCTAClick(); setMobileOpen(false); }}
                  className="rounded-md px-4 py-2.5 text-sm font-medium text-black"
                  style={{
                    background: "linear-gradient(to bottom, #ffffff, rgba(255,255,255,0.7))",
                  }}
                >
                  Get Started
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      <AuthModal
        open={authOpen}
        onOpenChange={setAuthOpen}
        onSuccess={() => { setAuthOpen(false); router.push("/chat"); }}
      />
    </>
  );
}
