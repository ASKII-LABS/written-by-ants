"use client";

import { FormEvent, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/browser";

export function LoginForm() {
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    setMessage("Magic link sent. Check your email.");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium text-ant-ink">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="w-full rounded border border-ant-border bg-ant-paper px-3 py-2 outline-none transition focus:border-ant-primary"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="cursor-pointer rounded border border-ant-primary bg-ant-primary px-4 py-2 font-medium text-ant-paper transition hover:bg-ant-accent disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading ? "Sending..." : "Send link"}
      </button>

      {message ? <p className="text-sm text-ant-primary">{message}</p> : null}
      {error ? <p className="text-sm text-ant-primary">{error}</p> : null}
    </form>
  );
}
