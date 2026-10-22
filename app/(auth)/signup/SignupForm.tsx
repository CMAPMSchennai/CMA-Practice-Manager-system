"use client";

import * as React from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { Eye, EyeOff, Building2, Users, FileCheck, TrendingUp } from "lucide-react";
import { resolveSafePostAuthPath } from "@/lib/utils";
import {
  SocialSignInButtons,
  socialSignInActive,
  socialSignInVisible,
} from "@/components/auth/SocialSignInButtons";

type SignupFormProps = {
  googleEnabled: boolean;
  emailEnabled: boolean;
  microsoftEnabled: boolean;
  inSandbox: boolean;
};

export function SignupForm({
  googleEnabled,
  emailEnabled,
  microsoftEnabled,
  inSandbox,
}: SignupFormProps) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const socialActive = socialSignInActive(googleEnabled, microsoftEnabled);
  const showSocialRow = socialSignInVisible(
    googleEnabled,
    microsoftEnabled,
    inSandbox,
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !emailEnabled) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name: name || null }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setErrorMessage(data.error || "Signup failed. Try again.");
        return;
      }
      const result = await signIn("credentials", {
        email,
        password,
        callbackUrl: "/",
        redirect: false,
      });
      if (result?.error) {
        setErrorMessage("Account created, but sign-in failed. Try /login.");
        return;
      }
      window.location.assign(resolveSafePostAuthPath("/", result?.url));
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
            Join the practice<br />management platform
          </h2>
          <p className="text-white/70 text-sm font-light leading-relaxed max-w-xs">
            Set up your account to manage clients, engagements, billing, and statutory compliance
            across all three firm entities.
          </p>
        </div>

        <div className="space-y-5">
          {[
            { icon: Users, label: "261 clients on record", sub: "Individuals, companies & trusts" },
            { icon: FileCheck, label: "Statutory due dates", sub: "Never miss a compliance deadline" },
            { icon: TrendingUp, label: "Partner-level P&L", sub: "Monthly close from the system" },
          ].map(({ icon: Icon, label, sub }) => (
            <div key={label} className="flex items-start gap-3">
              <div className="mt-0.5 w-7 h-7 rounded-md bg-white/10 flex items-center justify-center flex-shrink-0">
                <Icon className="w-3.5 h-3.5 text-white/80" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white leading-tight">{label}</p>
                <p className="text-xs text-white/55 font-light mt-0.5">{sub}</p>
              </div>
            </div>
          ))}
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

          <h1 className="text-2xl font-bold text-[#333333] tracking-tight">Create account</h1>
          <p className="mt-1.5 text-sm text-[#666666] font-light">
            {socialActive && emailEnabled
              ? "Use a social account or register with your email."
              : socialActive
                ? "Use your social account to continue."
                : emailEnabled
                  ? inSandbox
                    ? "Register with your email and a password."
                    : "Register with your email and a password."
                  : "Social sign-in is not enabled yet."}
          </p>

          <SocialSignInButtons
            googleEnabled={googleEnabled}
            microsoftEnabled={microsoftEnabled}
            inSandbox={inSandbox}
            callbackUrl="/"
            showDivider={emailEnabled}
          />

          {emailEnabled && (
            <form
              onSubmit={onSubmit}
              className={`space-y-4 ${showSocialRow ? "" : "mt-6"}`}
            >
              <div className="space-y-1.5">
                <label htmlFor="name" className="block text-xs font-bold text-[#333333] uppercase tracking-wide">
                  Full name
                </label>
                <input
                  id="name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-full rounded-lg border border-[#888888] bg-white px-4 py-3 text-sm text-[#056dae] placeholder:text-[#888888] focus:outline-none focus:ring-2 focus:ring-[#002d72]/25 focus:border-[#002d72] transition-colors"
                  style={{ height: "52px" }}
                />
              </div>

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

              <div className="space-y-1.5">
                <label htmlFor="password" className="block text-xs font-bold text-[#333333] uppercase tracking-wide">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="w-full rounded-lg border border-[#888888] bg-white px-4 py-3 pr-11 text-sm text-[#056dae] placeholder:text-[#888888] focus:outline-none focus:ring-2 focus:ring-[#002d72]/25 focus:border-[#002d72] transition-colors"
                    style={{ height: "52px" }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-[#888888] hover:text-[#333333] transition-colors"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              {errorMessage && (
                <p className="text-xs text-[#d60000] bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {errorMessage}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || !email || !password}
                className="w-full rounded-lg bg-[#056dae] px-4 text-sm font-bold text-white hover:bg-[#002256] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                style={{ height: "46px" }}
              >
                {submitting ? "Creating…" : "Create account"}
              </button>
            </form>
          )}

          {!emailEnabled && errorMessage && (
            <p className="mt-4 text-sm text-[#d60000]">{errorMessage}</p>
          )}

          <p className="mt-6 text-center text-xs text-[#666666]">
            Already have an account?{" "}
            <Link href="/login" className="font-bold text-[#056dae] hover:text-[#002256] transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
