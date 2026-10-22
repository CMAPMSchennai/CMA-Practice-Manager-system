"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { AuthSessionProvider } from "@/components/AuthSessionProvider";
import { ThemeProvider } from "@/lib/theme-context";
import { Toaster } from "@/components/ui/sonner";

// App Router client-provider shell — the analogue of the Pages Router
// `pages/_app.tsx`. Mounts AuthSessionProvider + ThemeProvider + Toaster and
// the platform preview error-forward / route-report bridge. Keep the
// __AS_ERROR_FORWARD_V5__ marker so the platform overlay's idempotency check
// recognizes it. AuthSessionProvider is locked; scaffold is passthrough until
// provisionAuth swaps in NextAuth's SessionProvider.

/** Console format specifiers; `%%` is a literal percent. */
const AS_FORMAT_SPEC = /%([sdifoOc%])/g;

/**
 * React logs hydration errors printf-style:
 *   console.error("In HTML, %s cannot be a descendant of <%s>.", "<div>", "p")
 * Joining the args verbatim left the operator — and the fix agent that
 * receives this text — reading raw "%s" instead of the tag names, which are
 * the only part that says what to change (live 2026-08-13).
 */
function substituteConsoleFormat(
  template: string,
  rest: unknown[],
): { text: string; used: number } {
  let used = 0;
  const text = template.replace(AS_FORMAT_SPEC, (match, spec) => {
    if (spec === "%") return "%";
    if (used >= rest.length) return match;
    const value = rest[used++];
    if (spec === "c") return ""; // css styling arg — carries no meaning here
    if (typeof value === "string") return value;
    if (value instanceof Error) return value.message;
    try {
      return typeof value === "object" && value !== null
        ? JSON.stringify(value)
        : String(value);
    } catch {
      return String(value);
    }
  });
  return { text, used };
}

/** Merge console.error args, substituting printf specifiers; skip vague-only headlines. */
function formatConsoleErrorArgs(args: unknown[]): string {
  const parts: string[] = [];
  let rest = args;
  const first = args[0];
  if (typeof first === "string" && /%[sdifoOc%]/.test(first)) {
    const { text, used } = substituteConsoleFormat(first, args.slice(1));
    parts.push(text);
    rest = args.slice(1 + used);
  }
  for (const a of rest) {
    if (a == null) continue;
    if (typeof a === "string") {
      parts.push(a);
      continue;
    }
    if (a instanceof Error) {
      parts.push(a.message + (a.stack ? "\n" + a.stack.slice(0, 1200) : ""));
      continue;
    }
    try {
      parts.push(JSON.stringify(a));
    } catch {
      parts.push(String(a));
    }
  }
  return parts.join("\n").slice(0, 4000);
}

/**
 * Known-benign framework noise swallowed BEFORE the original console.error —
 * this wrapper is outermost, so swallowing here also keeps it out of the Next
 * dev overlay ("Console Error" badge) the operator sees in the preview.
 *
 * Only exact, well-understood dev-mode warnings belong here. Current list:
 * - React 19 warns when a <script> element renders inside a client component.
 *   next-themes (ThemeProvider) injects its FOUC-prevention script that way;
 *   the script already executed from the server HTML — the warning is pure
 *   noise for every generated app.
 */
function isBenignFrameworkNoise(args: unknown[]): boolean {
  const first = typeof args[0] === "string" ? args[0] : "";
  return first.includes(
    "Encountered a script tag while rendering React component",
  );
}

function shouldForwardToParent(m: string): boolean {
  return (
    m.includes("Hydration") ||
    m.includes("hydration") ||
    m.includes("did not match") ||
    m.includes("Parsing ecmascript") ||
    m.includes("Build Error") ||
    m.includes("Runtime Error") ||
    m.includes("Unhandled Runtime") ||
    m.includes("Module not found") ||
    m.includes("Expected") ||
    m.includes("Unexpected token") ||
    m.includes("SyntaxError") ||
    m.includes("Conflicting app and page file") ||
    // Every ordinary crash — the TypeError / RangeError / ReferenceError an
    // operator actually hits. React logs one console.error per uncaught render
    // error and this sentence is its only stable marker; the error's own text
    // ("Invalid time value") matches nothing above. The window "error" hook
    // below cannot cover this class: Next 16's dev overlay catches render
    // errors in an error boundary, so React takes the onCaughtError path and
    // never calls reportGlobalError — no ErrorEvent is ever dispatched
    // (verified live on 16.3, 2026-08-17).
    m.includes("The above error occurred in")
  );
}

function isVagueOnlyHeadline(formatted: string): boolean {
  const t = formatted.trim();
  return /^(Parsing ecmascript|Build Error|Runtime Error)\s*$/i.test(t);
}

// __AS_ERROR_FORWARD_V5__ — install BOTH hooks at module level: this runs when
// the JS bundle loads, before React begins hydration.
//
// V5 widened the console whitelist to React's uncaught-render marker (see
// shouldForwardToParent). V4 assumed the window hook below would catch thrown
// errors; when the dev overlay's error boundary catches them first it never
// fires, so every RangeError/TypeError was visible in the preview with no
// "Fix now" (live 2026-08-17).
//
// V3 registered the window listeners from a useEffect, which is one commit too
// late to ever see a hydration mismatch. React 19 no longer console.errors
// those (`throwOnHydrationMismatch` queues an Error instead), and Next routes
// the queued error through onRecoverableError → reportError() — a window
// "error" event dispatched while the failing commit is still flushing, before
// any passive effect has run. So the console hook could not see it (wrong
// channel) and the effect hook did not exist yet (wrong time): a hydration
// error reached the operator's console and nothing else, with no "Fix now"
// (live 2026-08-16).
if (
  typeof window !== "undefined" &&
  !(window as unknown as { __AS_ERROR_FORWARD__?: boolean }).__AS_ERROR_FORWARD__
) {
  (window as unknown as { __AS_ERROR_FORWARD__: boolean }).__AS_ERROR_FORWARD__ =
    true;

  // `route` is the document the error actually happened on. The parent used to
  // infer it from the last ROUTE_NAVIGATED it received — which, for anything
  // reported during load, is still the PREVIOUS page: the error was attributed
  // to the route the operator navigated away from, and the parent's
  // clear-stale-error-on-route-change then wiped a card that had just arrived.
  const send = (message: string, stack?: string) => {
    if (!message.trim()) return;
    try {
      window.parent?.postMessage(
        {
          type: "__AS_RUNTIME_ERROR__",
          message: message.slice(0, 2500),
          stack,
          route: window.location.pathname,
        },
        "*",
      );
    } catch {
      /* ignore */
    }
  };

  const _origError = console.error.bind(console);
  (console as unknown as { error: (...a: unknown[]) => void }).error = (
    ...args: unknown[]
  ) => {
    if (isBenignFrameworkNoise(args)) return;
    _origError(...args);
    const formatted = formatConsoleErrorArgs(args);
    if (!formatted.trim()) return;
    if (!shouldForwardToParent(formatted)) return;
    if (isVagueOnlyHeadline(formatted)) return;
    send(formatted);
  };

  // Thrown errors, unhandled rejections, and React recoverable errors (which
  // arrive here as a reportError-dispatched ErrorEvent). Unfiltered on
  // purpose — unlike a console.error, anything reaching these handlers already
  // broke the page. Prefer `error.message` over the event's "Uncaught …"
  // wrapper so the headline the operator and the fix agent read is the error
  // itself.
  window.addEventListener("error", (e: ErrorEvent) => {
    const message =
      e.error instanceof Error && e.error.message ? e.error.message : e.message;
    send(
      message + (e.filename ? `\n  at ${e.filename}:${e.lineno}` : ""),
      (e.error as Error | undefined)?.stack,
    );
  });
  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    const reason: unknown = e.reason;
    send(
      reason instanceof Error ? reason.message : String(reason),
      (reason as Error | undefined)?.stack,
    );
  });
}

// __AS_NEXT_DEV_OVERLAY__ — load the preview overlay bridge.
//
// The Pages Router hangs this off a <script src> in `pages/_document.tsx`.
// App Router has no _document, so before this the bridge never loaded on this
// stack at all and the dev-overlay channel did not exist: a thrown render
// error reached the workbench as React's message plus a component name, with
// no file, line, code frame, or call stack (the panel carries all four).
//
// Loaded here rather than from app/layout.tsx because the layout is a server
// component whose JSX agent code rewrites freely; this shell already hosts the
// platform's client-side bridges. Loading after hydration is fine — the bridge
// rescans on a MutationObserver plus a 2.5s interval, so it still reports a
// panel that opened before it arrived.
if (
  typeof window !== "undefined" &&
  !(window as unknown as { __AS_PREVIEW_BRIDGE_LOADED__?: boolean })
    .__AS_PREVIEW_BRIDGE_LOADED__
) {
  (
    window as unknown as { __AS_PREVIEW_BRIDGE_LOADED__: boolean }
  ).__AS_PREVIEW_BRIDGE_LOADED__ = true;
  try {
    const src = "/__as_preview_bridge.js";
    if (!document.querySelector(`script[src="${src}"]`)) {
      const tag = document.createElement("script");
      tag.src = src;
      tag.async = true;
      document.head.appendChild(tag);
    }
  } catch {
    /* ignore */
  }
}

// Reports client-side route changes to the parent preview so the platform
// page-switcher stays in sync. App Router uses usePathname().
function useRouteReporter() {
  const pathname = usePathname();
  useEffect(() => {
    try {
      window.parent?.postMessage(
        { type: "ROUTE_NAVIGATED", route: pathname || "/" },
        "*",
      );
    } catch {
      /* ignore */
    }
  }, [pathname]);
}

export function Providers({ children }: { children: React.ReactNode }) {
  useRouteReporter();

  return (
    <ThemeProvider>
      <AuthSessionProvider>
        {children}
        <Toaster richColors position="bottom-right" />
      </AuthSessionProvider>
    </ThemeProvider>
  );
}
