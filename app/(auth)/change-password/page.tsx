/**
 * /change-password — first-login password setup after an admin-issued
 * one-time password (Gap #14). The protected layout redirects here while the
 * requirement is pending; anyone without one goes straight to the dashboard.
 */
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getPasswordChangeState } from "@/lib/temp-password";
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";

export default async function ChangePasswordPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const state = await getPasswordChangeState(session.user.id);
  if (!state.required) {
    redirect("/dashboard");
  }
  return <ChangePasswordForm email={session.user.email ?? null} expired={state.expired} />;
}
