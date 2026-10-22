"use client";

import { AppShell } from "@/components/layout/AppShell";
import { IdleLogout } from "@/components/layout/IdleLogout";
import type { PermissionMap } from "@/lib/nav-access";

export function ProtectedShell({
  children,
  permissions,
  roleName,
}: {
  children: React.ReactNode;
  permissions: PermissionMap;
  roleName?: string | null;
}) {
  return (
    <>
      <IdleLogout />
      <AppShell permissions={permissions} roleName={roleName}>
        {children}
      </AppShell>
    </>
  );
}
