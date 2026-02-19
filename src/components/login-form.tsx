"use client";

import { FormEvent, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/browser";

const OTP_LENGTH = 8;
const OTP_PATTERN = new RegExp(`^\\d{${OTP_LENGTH}}$`);

type LoginStep = "request" | "verify";

export function LoginForm() {
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<LoginStep>("request");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError("Enter your email first.");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
    });

    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    setStep("verify");
    setCode("");
    setMessage(`Code sent to ${normalizedEmail}.`);
  }

  async function verifyCode() {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCode = code.trim();

    if (!OTP_PATTERN.test(normalizedCode)) {
      setError(`Enter the ${OTP_LENGTH}-digit code from your email.`);
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token: normalizedCode,
      type: "email",
    });

    setLoading(false);

    if (verifyError) {
      setError(verifyError.message);
      return;
    }

    setMessage("Signed in. Redirecting...");
    window.location.assign("/login");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (step === "request") {
      await sendCode();
      return;
    }

    await verifyCode();
  }

  function useDifferentEmail() {
    setStep("request");
    setCode("");
    setMessage(null);
    setError(null);
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
          disabled={loading || step === "verify"}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="w-full rounded border border-ant-border bg-ant-paper px-3 py-2 outline-none transition focus:border-ant-primary"
        />
      </div>

      {step === "verify" ? (
        <div className="space-y-2">
          <label htmlFor="code" className="text-sm font-medium text-ant-ink">
            8-digit code
          </label>
          <input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            maxLength={OTP_LENGTH}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH))}
            placeholder="12345678"
            className="w-full rounded border border-ant-border bg-ant-paper px-3 py-2 tracking-[0.25em] outline-none transition focus:border-ant-primary"
          />
          <p className="text-xs text-ant-ink/70">
            Enter the 8-digit code from your email. You can use it from any device.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={loading}
          className="cursor-pointer rounded border border-ant-primary bg-ant-primary px-4 py-2 font-medium text-ant-paper transition hover:bg-ant-accent disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading
            ? step === "request"
              ? "Sending..."
              : "Verifying..."
            : step === "request"
              ? "Send code"
              : "Verify code"}
        </button>

        {step === "verify" ? (
          <button
            type="button"
            disabled={loading}
            onClick={sendCode}
            className="cursor-pointer rounded border border-ant-border px-4 py-2 font-medium text-ant-ink transition hover:border-ant-primary hover:text-ant-primary disabled:cursor-not-allowed disabled:opacity-70"
          >
            Resend code
          </button>
        ) : null}

        {step === "verify" ? (
          <button
            type="button"
            disabled={loading}
            onClick={useDifferentEmail}
            className="cursor-pointer rounded border border-ant-border px-4 py-2 font-medium text-ant-ink transition hover:border-ant-primary hover:text-ant-primary disabled:cursor-not-allowed disabled:opacity-70"
          >
            Change email
          </button>
        ) : null}
      </div>

      {message ? <p className="text-sm text-ant-primary">{message}</p> : null}
      {error ? <p className="text-sm text-ant-primary">{error}</p> : null}
    </form>
  );
}
