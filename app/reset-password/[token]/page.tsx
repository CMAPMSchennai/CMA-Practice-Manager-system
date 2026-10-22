"use client";

import * as React from "react";
import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Building2, ShieldCheck, ArrowLeft } from "lucide-react";

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-white">
          <div className="text-sm text-[#666666]">Loading…</div>
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const params = useParams();
  const searchParams = useSearchParams();
  const token =
    typeof params?.token === "string"
      ? params.token
      : Array.isArray(params?.token)
        ? params.token[0]
        : undefined;
  const email = searchParams.get("email") ?? undefined;

  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (password !== confirm) {
      setErrorMessage("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErrorMessage(data.error || "Reset failed. Request a new link.");
        return;
      }
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (!token || !email) {
    return (
      <div className="min-h-screen flex flex-col md:flex-row">
        <div className="hidden md:flex md:w-[45%] lg:w-[40%] flex-col justify-between bg-[#002d72] text-white p-10 lg:p-14 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-white/15 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-bold text-lg tracking-tight leading-none">
              CMA Practice<br />
              <span className="text-white/70 font-light text-sm">Manager</span>
            </span>
          </div>
          <p className="text-white/35 text-xs font-light">
            © {new Date().getFullYear()} Chandramouli &amp; Associates LLP.
          </p>
        </div>
        <div className="flex-1 flex items-center justify-center bg-white px-6 py-12">
          <div className="w-full max-w-sm text-center">
            <h1 className="text-xl font-bold text-[#333333] mb-2">Invalid reset link</h1>
            <p className="text-sm text-[#666666] font-light mb-6">
              This reset link is missing required parameters or has expired.
            </p>
            <Link
              href="/forgot-password"
              className="inline-flex items-center gap-2 rounded-lg bg-[#056dae] px-6 text-sm font-bold text-white hover:bg-[#002256] transition-colors"
              style={{ height: "46px" }}
            >
              Request a new link
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Left panel — navy brand */}
      <div className="hidden md:flex md:w-[45%] lg:w-[40%] flex-col justify-between bg-[#002d72] text-white p-10 lg:p-14 flex-shrink-0">
        <div>
          <div className="flex items-center gap-2.5 mb-12">
            <div className="w-8 h-8 rounded-md bg-white/15 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-bold text-lg tracking-tight leading-none">
              CMA Practice<br />
              <span className="text-white/70 font-light text-sm">Manager</span>
            </span>
          </div>

          <h2 className="text-3xl lg:text-4xl font-bold leading-tight tracking-tight text-white mb-4">
            Set a new<br />password
          </h2>
          <p className="text-white/70 text-sm font-light leading-relaxed max-w-xs">
            Choose a strong password that you don&apos;t use elsewhere. Minimum 8 characters.
          </p>
        </div>

        <div className="rounded-xl bg-white/8 border border-white/15 p-5">
          <div className="w-8 h-8 rounded-md bg-white/10 flex items-center justify-center mb-3">
            <ShieldCheck className="w-4 h-4 text-white/80" />
          </div>
          <p className="text-sm font-semibold text-white mb-1">Security tip</p>
          <p className="text-xs text-white/55 font-light leading-relaxed">
            Use a mix of uppercase, lowercase, numbers, and symbols. Don&apos;t reuse passwords
            across sites.
          </p>
        </div>

        <p className="text-white/35 text-xs font-light mt-10">
          © {new Date().getFullYear()} Chandramouli &amp; Associates LLP. All rights reserved.
        </p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex md:hidden items-center gap-2 mb-8">
            <div className="w-7 h-7 rounded-md bg-[#002d72] flex items-center justify-center">
              <Building2 className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-[#002d72] text-base tracking-tight">CMA Practice Manager</span>
          </div>

          <h1 className="text-2xl font-bold text-[#333333] tracking-tight">Set a new password</h1>
          <p className="mt-1.5 text-sm text-[#666666] font-light">
            For <span className="font-medium text-[#333333]">{email}</span>
          </p>

          {done ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-lg border border-[#006e0a]/30 bg-green-50 px-4 py-3 text-sm text-[#006e0a]">
                <p className="font-semibold mb-0.5">Password updated successfully</p>
                <p className="text-xs font-light">You can now sign in with your new password.</p>
              </div>
              <Link
                href="/login"
                className="flex items-center justify-center gap-2 w-full rounded-lg bg-[#056dae] px-4 text-sm font-bold text-white hover:bg-[#002256] transition-colors"
                style={{ height: "46px" }}
              >
                Sign in to your account
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="password" className="block text-xs font-bold text-[#333333] uppercase tracking-wide">
                  New password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full rounded-lg border border-[#888888] bg-white px-4 py-3 text-sm text-[#056dae] placeholder:text-[#888888] focus:outline-none focus:ring-2 focus:ring-[#002d72]/25 focus:border-[#002d72] transition-colors"
                  style={{ height: "52px" }}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="confirm" className="block text-xs font-bold text-[#333333] uppercase tracking-wide">
                  Confirm password
                </label>
                <input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repeat your new password"
                  className="w-full rounded-lg border border-[#888888] bg-white px-4 py-3 text-sm text-[#056dae] placeholder:text-[#888888] focus:outline-none focus:ring-2 focus:ring-[#002d72]/25 focus:border-[#002d72] transition-colors"
                  style={{ height: "52px" }}
                />
              </div>

              {errorMessage && (
                <p className="text-xs text-[#d60000] bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {errorMessage}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || !password || !confirm}
                className="w-full rounded-lg bg-[#056dae] px-4 text-sm font-bold text-white hover:bg-[#002256] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                style={{ height: "46px" }}
              >
                {submitting ? "Updating…" : "Update password"}
              </button>

              <p className="text-center text-xs text-[#666666]">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1 font-bold text-[#056dae] hover:text-[#002256] transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to sign in
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
