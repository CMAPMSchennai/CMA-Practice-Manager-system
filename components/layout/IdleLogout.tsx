"use client";

/**
 * NFR-12: sign the user out after 30 minutes without activity.
 * Activity in any open tab counts — the last-activity time is shared across
 * tabs through localStorage (best effort; falls back to this tab only).
 */
import * as React from "react";
import { signOut } from "next-auth/react";

const IDLE_LIMIT_MS = 30 * 60 * 1000;
const CHECK_EVERY_MS = 30 * 1000;
const STORAGE_KEY = "pms:last-activity";
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "wheel"] as const;

function readShared(): number | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const value = raw ? Number(raw) : NaN;
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function writeShared(value: number) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // storage unavailable — this tab's own timer still applies
  }
}

export function IdleLogout() {
  const lastActivity = React.useRef(Date.now());
  const lastWrite = React.useRef(0);
  const signingOut = React.useRef(false);

  React.useEffect(() => {
    const now = Date.now();
    lastActivity.current = now;
    writeShared(now);

    const markActive = () => {
      const t = Date.now();
      lastActivity.current = t;
      // throttle storage writes to once every 5 seconds
      if (t - lastWrite.current > 5000) {
        lastWrite.current = t;
        writeShared(t);
      }
    };

    const check = () => {
      if (signingOut.current) return;
      const shared = readShared();
      const latest = Math.max(lastActivity.current, shared ?? 0);
      if (Date.now() - latest >= IDLE_LIMIT_MS) {
        signingOut.current = true;
        signOut({ callbackUrl: "/login" });
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
    };

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, markActive, { passive: true }));
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(check, CHECK_EVERY_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, markActive));
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
