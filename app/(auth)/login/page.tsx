import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  const googleEnabled = process.env.AUTH_GOOGLE_ENABLED === "true";
  const microsoftEnabled = process.env.AUTH_MICROSOFT_ENABLED === "true";
  const emailEnabled = process.env.AUTH_EMAIL_PASSWORD_ENABLED !== "false";
  const inSandbox = process.env.E2B_SANDBOX === "true";

  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-white">
          <div className="text-sm text-[#666666]">Loading…</div>
        </div>
      }
    >
      <LoginForm
        googleEnabled={googleEnabled}
        microsoftEnabled={microsoftEnabled}
        emailEnabled={emailEnabled}
        inSandbox={inSandbox}
      />
    </Suspense>
  );
}
