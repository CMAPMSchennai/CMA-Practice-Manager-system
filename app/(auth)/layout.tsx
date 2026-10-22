/**
 * Auth route-group layout.
 * Renders auth pages (login, signup, forgot-password) in a clean full-screen
 * shell without any dashboard chrome (no sidebar, no topbar). The light / dark
 * switch (Gap #45) sits in the top-right corner so it is available before sign-in.
 */
import { ThemeToggle } from "@/components/layout/ThemeToggle";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="fixed right-3 top-3 z-50">
        <ThemeToggle />
      </div>
      {children}
    </>
  );
}
