"use client";

/**
 * Google / Microsoft sign-in buttons — shared by login and signup.
 * Configure → Auth flags control enablement; sandbox always shows
 * disabled stubs until providers are turned on.
 */
import * as React from "react";

export type SocialSignInButtonsProps = {
  googleEnabled: boolean;
  microsoftEnabled: boolean;
  /** Preview sandbox only — show disabled social buttons when not enabled. */
  inSandbox: boolean;
  callbackUrl?: string;
  /** When false, hide the email/password form divider below. Default true. */
  showDivider?: boolean;
};

export function SocialSignInButtons({
  googleEnabled,
  microsoftEnabled,
  inSandbox,
  callbackUrl = "/",
  showDivider = true,
}: SocialSignInButtonsProps) {
  const showGoogle = googleEnabled || inSandbox;
  const showMicrosoft = microsoftEnabled || inSandbox;
  const showSocialRow = showGoogle || showMicrosoft;

  if (!showSocialRow) return null;

  function startGoogle() {
    if (!googleEnabled) return;
    navigateForOAuth(
      `/api/auth/platform/google/start?callbackUrl=${encodeURIComponent(callbackUrl)}`,
    );
  }

  function startMicrosoft() {
    if (!microsoftEnabled) return;
    navigateForOAuth(
      `/api/auth/platform/microsoft/start?callbackUrl=${encodeURIComponent(callbackUrl)}`,
    );
  }

  return (
    <>
      {showGoogle && (
        <button
          type="button"
          disabled={!googleEnabled}
          onClick={startGoogle}
          title={
            googleEnabled ? undefined : "Enable Google in Configure → Auth"
          }
          aria-disabled={!googleEnabled}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg border bg-background px-4 py-2 text-sm font-medium transition-colors enabled:hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          <GoogleIcon />
          Continue with Google
        </button>
      )}

      {showMicrosoft && (
        <button
          type="button"
          disabled={!microsoftEnabled}
          onClick={startMicrosoft}
          title={
            microsoftEnabled
              ? undefined
              : "Enable Microsoft in Configure → Auth"
          }
          aria-disabled={!microsoftEnabled}
          className={`${showGoogle ? "mt-2" : "mt-5"} flex w-full items-center justify-center gap-2 rounded-lg border bg-background px-4 py-2 text-sm font-medium transition-colors enabled:hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50`}
        >
          <MicrosoftIcon />
          Continue with Microsoft
        </button>
      )}

      {showDivider && (
        <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wider text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>
      )}
    </>
  );
}

export function socialSignInActive(
  googleEnabled: boolean,
  microsoftEnabled: boolean,
): boolean {
  return googleEnabled || microsoftEnabled;
}

export function socialSignInVisible(
  googleEnabled: boolean,
  microsoftEnabled: boolean,
  inSandbox: boolean,
): boolean {
  return googleEnabled || microsoftEnabled || inSandbox;
}

/**
 * In workbench preview (iframe): open OAuth in a new tab so the workbench
 * stays open. Preview iframe uses allow-popups-to-escape-sandbox (popup is
 * not sandboxed) + backend CORP cross-origin on /platformconnectors so the
 * Dual7 callback is not ERR_BLOCKED_BY_RESPONSE.
 *
 * Do not pass "noopener" in windowFeatures — browsers return null even when
 * the tab opens, which falsely triggers _top / location.assign and loads
 * Google inside the iframe ("This content is blocked"). Clear opener instead.
 * Fall back to _top only if the popup is truly blocked. Standalone: same-tab.
 */
function navigateForOAuth(url: string) {
  const inPreviewIframe = Boolean(window.top && window.top !== window.self);
  if (inPreviewIframe) {
    const popup = window.open(url, "_blank");
    if (popup) {
      popup.opener = null;
      return;
    }
    try {
      window.open(url, "_top");
    } catch {
      window.location.assign(url);
    }
    return;
  }
  window.location.assign(url);
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8.1 3.1l5.7-5.7C34 6 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8.1 3.1l5.7-5.7C34 6 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.8-2 13.4-5.2l-6.2-5.2c-2 1.4-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.2-7.9l-6.5 5C9.6 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.6l6.2 5.2C40.8 35 44 30.1 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 23 23" aria-hidden="true">
      <path fill="#f35325" d="M1 1h10v10H1z" />
      <path fill="#81bc06" d="M12 1h10v10H12z" />
      <path fill="#05a6f0" d="M1 12h10v10H1z" />
      <path fill="#ffba08" d="M12 12h10v10H12z" />
    </svg>
  );
}
