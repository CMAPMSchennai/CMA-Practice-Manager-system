"use client";

/**
 * Platform-provided auth form wrapper — do NOT edit unless you want to
 * customize submit behavior. Wraps a designed <form> (its inputs/labels/
 * styling are the children) and turns it live against the platform's NextAuth:
 *   - mode="signin":  credentials sign-in, then redirect to callbackUrl
 *   - mode="signup":  POST /api/auth/signup, then sign in, then redirect
 *   - mode="forgot":  POST /api/auth/forgot-password, then "check your inbox"
 *
 * The Remix emitter injects name="email" | "password" | "name" onto each bound
 * control (from its `column`), so the designed markup is preserved exactly and
 * only submission behavior is added. This mirrors components/data/DataForm.tsx.
 */
import * as React from "react";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { resolveSafePostAuthPath } from "@/lib/utils";

export function AuthForm(props: {
  mode: "signin" | "signup" | "forgot";
  callbackUrl?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const callbackUrl = props.callbackUrl || "/";
  const [submitting, setSubmitting] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    const formEl = e.currentTarget;
    const fd = new FormData(formEl);
    const email = String(fd.get("email") ?? "");
    const password = String(fd.get("password") ?? "");
    const name = String(fd.get("name") ?? "");
    setSubmitting(true);
    try {
      if (props.mode === "forgot") {
        const res = await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error ?? "Request failed. Try again.");
        }
        toast.success("Check your inbox — the reset link expires in 1 hour.");
        formEl.reset();
        setSubmitting(false);
        return;
      }

      if (props.mode === "signup") {
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password, name: name || null }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error ?? "Signup failed. Try again.");
        }
      }

      // signin — or the follow-up sign-in after a successful signup.
      const result = await signIn("credentials", {
        email,
        password,
        callbackUrl,
        redirect: false,
      });
      if (result?.error) {
        throw new Error(
          props.mode === "signup"
            ? "Account created, but sign-in failed. Try signing in."
            : "Email or password is incorrect.",
        );
      }
      // Full navigation so the new session is picked up everywhere.
      window.location.assign(resolveSafePostAuthPath(callbackUrl, result?.url));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className={props.className} data-submitting={submitting}>
      {props.children}
    </form>
  );
}
