import { SignupForm } from "./SignupForm";

export default function SignupPage() {
  const googleEnabled = process.env.AUTH_GOOGLE_ENABLED === "true";
  const microsoftEnabled = process.env.AUTH_MICROSOFT_ENABLED === "true";
  const emailEnabled = process.env.AUTH_EMAIL_PASSWORD_ENABLED !== "false";
  const inSandbox = process.env.E2B_SANDBOX === "true";

  return (
    <SignupForm
      googleEnabled={googleEnabled}
      microsoftEnabled={microsoftEnabled}
      emailEnabled={emailEnabled}
      inSandbox={inSandbox}
    />
  );
}
