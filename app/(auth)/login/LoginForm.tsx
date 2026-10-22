"use client";

import * as React from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Building2, ShieldCheck, BarChart3 } from "lucide-react";
import { resolveSafePostAuthPath } from "@/lib/utils";
import {
  SocialSignInButtons,
  socialSignInActive,
  socialSignInVisible,
} from "@/components/auth/SocialSignInButtons";

type LoginFormProps = {
  googleEnabled: boolean;
  emailEnabled: boolean;
  microsoftEnabled: boolean;
  inSandbox: boolean;
};

export function LoginForm({
  googleEnabled,
  emailEnabled,
  microsoftEnabled,
  inSandbox,
}: LoginFormProps) {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const errorParam = searchParams.get("error") ?? undefined;

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [needsCode, setNeedsCode] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(
    errorParam ? humanizeAuthError(errorParam) : null,
  );

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
    if (!needsCode) {
      try {
        const chk = await fetch("/api/mfa/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const j = (await chk.json().catch(() => ({}))) as { needs_mfa?: boolean };
        if (j.needs_mfa) {
          setNeedsCode(true);
          setSubmitting(false);
          return;
        }
      } catch {
        /* fall through to the normal sign-in */
      }
    }
    const result = await signIn("credentials", {
      email,
      password,
      code: needsCode ? code : "",
      callbackUrl,
      redirect: false,
    });
    setSubmitting(false);
    if (result?.error) {
      setErrorMessage(
        needsCode && result.error === "CredentialsSignin"
          ? "That code was not right. Enter the 6-digit code from your authenticator app, or a recovery code."
          : humanizeAuthError(result.error),
      );
      return;
    }
    window.location.assign(resolveSafePostAuthPath(callbackUrl, result?.url));
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Left panel — navy brand */}
      <div className="hidden md:flex md:w-[45%] lg:w-[40%] flex-col justify-between bg-[#002d72] text-white p-10 lg:p-14 flex-shrink-0">
        {/* Logo */}
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
            Chandramouli &amp;<br />Associates LLP
          </h2>
          <p className="text-white/70 text-sm font-light leading-relaxed max-w-xs">
            Chartered Accountants · Chennai. Practice management system for
            engagements, compliance, billing and payroll.
          </p>
        </div>

        {/* Feature list */}
        <div className="space-y-5">
          {[
            { icon: ShieldCheck, label: "KYC & client onboarding", sub: "Compliance-first client master" },
            { icon: BarChart3, label: "Engagement tracking", sub: "714 codified audit procedures" },
            { icon: Building2, label: "Multi-entity billing", sub: "CMA LLP · SGC · GMC" },
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

          <h1 className="text-2xl font-bold text-[#333333] tracking-tight">Sign in</h1>
          <p className="mt-1.5 text-sm text-[#666666] font-light">
            {socialActive && emailEnabled
              ? "Use a social account or your email and password."
              : socialActive
                ? "Use your social account to continue."
                : emailEnabled
                  ? inSandbox
                    ? "Enter your email and password to access the practice manager."
                    : "Enter your email and password to continue."
                  : "Social sign-in is not enabled yet."}
          </p>

          <SocialSignInButtons
            googleEnabled={googleEnabled}
            microsoftEnabled={microsoftEnabled}
            inSandbox={inSandbox}
            callbackUrl={callbackUrl}
            showDivider={emailEnabled}
          />

          {emailEnabled && (
            <form
              onSubmit={onSubmit}
              className={`space-y-4 ${showSocialRow ? "" : "mt-6"}`}
            >
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
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="block text-xs font-bold text-[#333333] uppercase tracking-wide">
                    Password
                  </label>
                  <Link
                    href="/forgot-password"
                    className="text-xs text-[#056dae] hover:text-[#002256] transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
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

              {needsCode && (
                <div className="space-y-1.5">
                  <label htmlFor="code" className="block text-xs font-bold text-[#333333] uppercase tracking-wide">
                    Authenticator code
                  </label>
                  <input
                    id="code"
                    type="text"
                    inputMode="text"
                    autoComplete="one-time-code"
                    autoFocus
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="6-digit code or recovery code"
                    className="w-full rounded-lg border border-[#888888] bg-white px-4 py-3 text-sm text-[#056dae] placeholder:text-[#888888] focus:outline-none focus:ring-2 focus:ring-[#002d72]/25 focus:border-[#002d72] transition-colors"
                    style={{ height: "52px" }}
                  />
                  <p className="text-xs text-[#666666]">Open your authenticator app and type the code it shows for this account.</p>
                </div>
              )}

              {errorMessage && (
                <p className="text-xs text-[#d60000] bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {errorMessage}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || !email || !password || (needsCode && !code.trim())}
                className="w-full rounded-lg bg-[#056dae] px-4 text-sm font-bold text-white hover:bg-[#002256] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                style={{ height: "46px" }}
              >
                {submitting ? "Signing in…" : "Sign in"}
              </button>
            </form>
          )}

          {!emailEnabled && errorMessage && (
            <p className="mt-4 text-sm text-[#d60000]">{errorMessage}</p>
          )}

          {emailEnabled && (
            <p className="mt-6 text-center text-xs text-[#666666]">
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="font-bold text-[#056dae] hover:text-[#002256] transition-colors">
                Create account
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function humanizeAuthError(code: string): string {
  switch (code) {
    case "CredentialsSignin":
      return "Email or password is incorrect.";
    case "OAuthAccountNotLinked":
      return "This email is registered with a different sign-in method.";
    case "AccessDenied":
      return "Your account is not allowed to sign in here.";
    case "Configuration":
      return "Auth is misconfigured. Contact support.";
    case "platform_connector_misconfigured":
    case "platform_connector_unreachable":
    case "begin_failed":
      return "Social sign-in is temporarily unavailable.";
    default:
      return "Sign-in failed. Try again.";
  }
}
