"use client";

import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { Shield } from "lucide-react";

export function LoginPanel({ callbackUrl }: { callbackUrl: string }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const email = String(formData.get("email") ?? "").trim();
      const password = String(formData.get("password") ?? "");
      const name = String(formData.get("name") ?? "").trim();
      const title = String(formData.get("title") ?? "").trim();

      if (mode === "register") {
        const res = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name, title }),
        });
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          setError(json.error ?? "Could not create account");
          return;
        }
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl,
      });

      if (result?.error) {
        setError("Email or password is not right.");
        return;
      }

      window.location.href = result?.url || callbackUrl;
    });
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-bg-base text-txt-primary">
      <div className="w-full max-w-md p-8 rounded-2xl bg-bg-card border border-bg-line shadow-card">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-lg bg-grad-purple flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-xs text-txt-muted uppercase tracking-wider">Young Driver Insurance</div>
            <div className="text-lg font-semibold">Command Centre</div>
          </div>
        </div>

        <div className="flex rounded-lg overflow-hidden border border-bg-line mb-6">
          <button
            type="button"
            onClick={() => { setMode("login"); setError(null); }}
            className={mode === "login" ? "flex-1 bg-brand-purple px-4 py-2 text-sm font-semibold text-white" : "flex-1 px-4 py-2 text-sm text-txt-muted hover:bg-bg-elev"}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => { setMode("register"); setError(null); }}
            className={mode === "register" ? "flex-1 bg-brand-purple px-4 py-2 text-sm font-semibold text-white" : "flex-1 px-4 py-2 text-sm text-txt-muted hover:bg-bg-elev"}
          >
            Create login
          </button>
        </div>

        <h1 className="text-2xl font-semibold mb-2">{mode === "login" ? "Sign in" : "Create your login"}</h1>
        <p className="text-txt-secondary text-sm mb-6">
          {mode === "login"
            ? "Use your Command Centre account."
            : "Create an account. Admins can decide which sections you can access."}
        </p>

        <form action={submit} className="space-y-4">
          {mode === "register" && (
            <>
              <label className="block">
                <span className="text-xs text-txt-muted">Name</span>
                <input name="name" required className="mt-1 w-full rounded-lg border border-bg-line bg-bg-elev px-3 py-2 text-sm outline-none focus:border-brand-purple" />
              </label>
              <label className="block">
                <span className="text-xs text-txt-muted">Title</span>
                <input name="title" placeholder="Team Member" className="mt-1 w-full rounded-lg border border-bg-line bg-bg-elev px-3 py-2 text-sm outline-none focus:border-brand-purple" />
              </label>
            </>
          )}

          <label className="block">
            <span className="text-xs text-txt-muted">Email</span>
            <input name="email" type="email" autoComplete="email" required className="mt-1 w-full rounded-lg border border-bg-line bg-bg-elev px-3 py-2 text-sm outline-none focus:border-brand-purple" />
          </label>
          <label className="block">
            <span className="text-xs text-txt-muted">Password</span>
            <input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required className="mt-1 w-full rounded-lg border border-bg-line bg-bg-elev px-3 py-2 text-sm outline-none focus:border-brand-purple" />
          </label>

          {error && <p className="rounded-lg border border-brand-red/30 bg-brand-red/10 px-3 py-2 text-sm text-brand-red">{error}</p>}

          <button type="submit" disabled={pending} className="w-full rounded-lg bg-brand-purple px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-purple/90 disabled:opacity-50">
            {pending ? "Working..." : mode === "login" ? "Sign in" : "Create login"}
          </button>
        </form>

        <p className="mt-6 text-xs text-txt-muted">
          `t.wilson@myfirst.com` is automatically treated as Global Admin when that account is created.
        </p>
      </div>
    </main>
  );
}
