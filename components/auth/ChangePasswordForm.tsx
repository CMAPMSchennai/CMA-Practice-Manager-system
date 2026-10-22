"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, ShieldCheck } from "lucide-react";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { Switch } from "@/components/ui/switch";

interface ChangePasswordFormProps {
  email: string | null;
  /** The admin-issued one-time password is past its 24-hour window. */
  expired: boolean;
}

const INPUT_CLASS =
  "w-full rounded-lg border border-[#888888] bg-white px-4 py-3 text-sm text-[#056dae] placeholder:text-[#888888] focus:outline-none focus:ring-2 focus:ring-[#002d72]/25 focus:border-[#002d72] transition-colors";

export function ChangePasswordForm({ email, expired }: ChangePasswordFormProps) {
  const router = useRouter();
  const [current, setCurrent] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  // Gap #19: let the user check what they typed before submitting.
  const [showPasswords, setShowPasswords] = React.useState(false);
  const passwordInputType = showPasswords ? "text" : "password";
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (password !== confirm) {
      setErrorMessage("New passwords don't match.");
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: current, new_password: password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErrorMessage(data.error || "Could not update your password. Please try again.");
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setErrorMessage("Could not update your password. Please try again.");
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
            Set your own<br />password
          </h2>
          <p className="text-white/70 text-sm font-light leading-relaxed max-w-xs">
            You signed in with a one-time password from your administrator. Choose your own
            password to continue. Minimum 8 characters.
          </p>
        </div>
        <div className="rounded-xl bg-white/8 border border-white/15 p-5">
          <div className="w-8 h-8 rounded-md bg-white/10 flex items-center justify-center mb-3">
            <ShieldCheck className="w-4 h-4 text-white/80" />
          </div>
          <p className="text-sm font-semibold text-white mb-1">Keep it private</p>
          <p className="text-xs text-white/55 font-light leading-relaxed">
            Nobody at the firm, including administrators, will ever ask for your password.
          </p>
        </div>
        <p className="text-white/35 text-xs font-light mt-10">
          © {new Date().getFullYear()} Chandramouli &amp; Associates LLP. All rights reserved.
        </p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="flex md:hidden items-center gap-2 mb-8">
            <div className="w-7 h-7 rounded-md bg-[#002d72] flex items-center justify-center">
              <Building2 className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-[#002d72] text-base tracking-tight">CMA Practice Manager</span>
          </div>

          <h1 className="text-2xl font-bold text-[#333333] tracking-tight">Set your password</h1>
          {email && (
            <p className="mt-1.5 text-sm text-[#666666] font-light">
              For <span className="font-medium text-[#333333]">{email}</span>
            </p>
          )}

          {expired ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#d60000]">
                <p className="font-semibold mb-0.5">Your one-time password has expired</p>
                <p className="text-xs font-light">
                  One-time passwords are valid for 24 hours. Ask your administrator to issue a new one.
                </p>
              </div>
              <SignOutButton />
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="current" className="block text-xs font-bold text-[#333333] uppercase tracking-wide">
                  One-time password
                </label>
                <input
                  id="current"
                  type={passwordInputType}
                  autoComplete="current-password"
                  required
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  placeholder="From your administrator"
                  className={INPUT_CLASS}
                  style={{ height: "52px" }}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="password" className="block text-xs font-bold text-[#333333] uppercase tracking-wide">
                  New password
                </label>
                <input
                  id="password"
                  type={passwordInputType}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className={INPUT_CLASS}
                  style={{ height: "52px" }}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="confirm" className="block text-xs font-bold text-[#333333] uppercase tracking-wide">
                  Confirm new password
                </label>
                <input
                  id="confirm"
                  type={passwordInputType}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repeat your new password"
                  className={INPUT_CLASS}
                  style={{ height: "52px" }}
                />
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="show-passwords"
                  checked={showPasswords}
                  onCheckedChange={setShowPasswords}
                />
                <label htmlFor="show-passwords" className="text-sm text-[#333333] cursor-pointer">
                  Show passwords
                </label>
              </div>

              {errorMessage && (
                <p className="text-xs text-[#d60000] bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {errorMessage}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || !current || !password || !confirm}
                className="w-full rounded-lg bg-[#056dae] px-4 text-sm font-bold text-white hover:bg-[#002256] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                style={{ height: "46px" }}
              >
                {submitting ? "Saving…" : "Save password and continue"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
