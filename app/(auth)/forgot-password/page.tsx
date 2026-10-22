"use client";

import * as React from "react";
import Link from "next/link";
import { Building2, Mail, ArrowLeft } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setErrorMessage(data.error || "Request failed. Try again.");
        return;
      }
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
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
            Account recovery
          </h2>
          <p className="text-white/70 text-sm font-light leading-relaxed max-w-xs">
            We&apos;ll send a secure reset link to your registered email address.
            The link expires in 1 hour for your security.
          </p>
        </div>

        <div className="rounded-xl bg-white/8 border border-white/15 p-5">
          <div className="w-8 h-8 rounded-md bg-white/10 flex items-center justify-center mb-3">
            <Mail className="w-4 h-4 text-white/80" />
          </div>
          <p className="text-sm font-semibold text-white mb-1">Check your inbox</p>
          <p className="text-xs text-white/55 font-light leading-relaxed">
            After submitting, look for an email from the CMA Practice Manager system.
            If you don&apos;t see it, check your spam folder.
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

          <h1 className="text-2xl font-bold text-[#333333] tracking-tight">Reset your password</h1>
          <p className="mt-1.5 text-sm text-[#666666] font-light">
            Enter your email and we&apos;ll send a reset link if an account exists.
          </p>

          {submitted ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-lg border border-[#006e0a]/30 bg-green-50 px-4 py-3 text-sm text-[#006e0a]">
                <p className="font-semibold mb-0.5">Reset link sent</p>
                <p className="text-xs font-light">Check your inbox. The link expires in 1 hour.</p>
              </div>
              <Link
                href="/login"
                className="flex items-center justify-center gap-2 w-full rounded-lg border border-[#056dae] text-[#056dae] px-4 text-sm font-bold hover:bg-[#056dae] hover:text-white transition-colors"
                style={{ height: "46px" }}
              >
                <ArrowLeft className="w-4 h-4" />
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-xs font-bold text-[#333333] uppercase tracking-wide">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
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
                disabled={submitting || !email}
                className="w-full rounded-lg bg-[#056dae] px-4 text-sm font-bold text-white hover:bg-[#002256] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                style={{ height: "46px" }}
              >
                {submitting ? "Sending…" : "Send reset link"}
              </button>
            </form>
          )}

          <p className="mt-6 text-center text-xs text-[#666666]">
            <Link
              href="/login"
              className="inline-flex items-center gap-1 font-bold text-[#056dae] hover:text-[#002256] transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
