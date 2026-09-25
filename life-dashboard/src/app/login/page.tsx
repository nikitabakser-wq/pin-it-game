"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabase } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/supabase/env";
import { Button, Field, Input } from "@/components/ui";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const notAllowed = useSearchParams().get("error") === "not-allowed";
  const [message, setMessage] = useState<{ kind: "error" | "info"; text: string } | null>(
    notAllowed ? { kind: "error", text: "This account is not allowed to open this dashboard." } : null,
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const supabase = getSupabase();
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace("/");
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) throw error;
        if (data.session) router.replace("/");
        else setMessage({ kind: "info", text: "Account created. Check your email to confirm it, then sign in." });
      }
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="app-glow flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl border border-line bg-surface">
            <span className="size-3 rounded-full bg-accent shadow-[0_0_16px_var(--color-accent)]" />
          </div>
          <h1 className="text-xl font-semibold tracking-[0.2em]">LIFE PROGRESS</h1>
          <p className="mt-2 text-sm text-muted">Your personal operating system for long-term progress.</p>
        </div>

        {!supabaseConfigured ? (
          <div className="rounded-2xl border border-mid/30 bg-mid/10 p-4 text-sm text-mid">
            Supabase is not configured. Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> (see README) and restart the app.
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 rounded-2xl border border-line bg-surface p-5">
            <Field label="Email">
              <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            {message && (
              <p role="status" className={message.kind === "error" ? "text-sm text-low" : "text-sm text-good"}>
                {message.text}
              </p>
            )}
            <Button type="submit" variant="primary" className="w-full" disabled={busy}>
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
            <button
              type="button"
              onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(null); }}
              className="w-full text-center text-xs text-muted hover:text-fg"
            >
              {mode === "signin" ? "First time here? Create the owner account" : "Already have an account? Sign in"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
