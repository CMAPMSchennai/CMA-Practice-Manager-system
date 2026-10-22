"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, Lock, Shield, ShieldCheck } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface RoleRecord {
  id: string;
  name: string;
  description: string | null;
  permissions: Record<string, boolean>;
  is_seeded: boolean;
  is_custom: boolean;
  cloned_from: string | null;
  hard_locked_actions?: string[];
  created_at: string;
  updated_at: string;
}

const PERMISSION_GROUPS: { label: string; actions: string[] }[] = [
  {
    label: "Settings / Admin",
    actions: [
      "manage_roles",
      "manage_users",
      "manage_entities",
      "manage_reference_data",
      "manage_settings",
    ],
  },
  {
    label: "Clients",
    actions: [
      "view_clients",
      "create_clients",
      "edit_clients",
      "delete_clients",
      "onboard_clients",
    ],
  },
  {
    label: "Employees",
    actions: [
      "view_employees",
      "create_employees",
      "edit_employees",
      "delete_employees",
      "view_own_employee",
    ],
  },
  {
    label: "Engagements",
    actions: [
      "view_engagements",
      "create_engagements",
      "edit_engagements",
      "delete_engagements",
    ],
  },
  {
    label: "Tasks",
    actions: ["view_tasks", "create_tasks", "edit_tasks", "review_tasks"],
  },
  {
    label: "Payroll",
    actions: ["view_payroll", "payroll_release"],
  },
  {
    label: "Billing",
    actions: [
      "view_billing",
      "create_invoices",
      "edit_invoices",
      "record_receipts",
    ],
  },
  {
    label: "Finance",
    actions: ["view_finance", "create_expenses"],
  },
  {
    label: "Compliance",
    actions: ["view_compliance", "manage_compliance"],
  },
  {
    label: "Reports",
    actions: ["view_reports", "export_reports"],
  },
  {
    label: "Documents",
    actions: ["view_documents", "upload_documents"],
  },
  {
    label: "Audit & Notifications",
    actions: [
      "view_audit_logs",
      "send_notifications",
      "view_notifications",
    ],
  },
  {
    label: "Special",
    actions: ["manage_erasure", "onboarding_override", "view_dashboard"],
  },
];

export function RolesPermissionsPage() {
  const { data, error, isLoading, mutate } = useSWR<{ roles: RoleRecord[] }>(
    "/api/settings/roles",
    fetcher
  );

  const [selectedRole, setSelectedRole] = useState<RoleRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [cloneDialog, setCloneDialog] = useState(false);
  const [cloneSourceId, setCloneSourceId] = useState<string | null>(null);
  const [cloneName, setCloneName] = useState("");
  const [cloning, setCloning] = useState(false);

  const roles = Array.isArray(data?.roles) ? data.roles : [];

  async function handlePermToggle(
    roleId: string,
    action: string,
    newValue: boolean
  ) {
    setSaving(true);
    try {
      const res = await fetch(`/api/settings/roles/${roleId}/permissions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [action]: newValue }),
      });
      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error || "Failed to update permission");
      } else {
        toast.success("Permission updated");
        mutate();
        // Update local selection
        if (selectedRole && selectedRole.id === roleId) {
          setSelectedRole({
            ...selectedRole,
            permissions: {
              ...selectedRole.permissions,
              [action]: newValue,
            },
          });
        }
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message.trim()
          ? err.message
          : "Something went wrong. Please try again.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleClone() {
    if (!cloneSourceId || !cloneName.trim()) return;
    setCloning(true);
    try {
      const res = await fetch(
        `/api/settings/roles/${cloneSourceId}/clone`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: cloneName.trim() }),
        }
      );
      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error || "Failed to clone role");
      } else {
        toast.success("Role cloned successfully");
        mutate();
        setCloneDialog(false);
        setCloneName("");
        setCloneSourceId(null);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message.trim()
          ? err.message
          : "Something went wrong. Please try again.";
      toast.error(message);
    } finally {
      setCloning(false);
    }
  }

  async function handleDeleteRole(roleId: string) {
    try {
      const res = await fetch(`/api/settings/roles/${roleId}/clone`, {
        method: "DELETE",
      });
      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error || "Failed to delete role");
      } else {
        toast.success("Role deleted");
        mutate();
        if (selectedRole?.id === roleId) setSelectedRole(null);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message.trim()
          ? err.message
          : "Something went wrong. Please try again.";
      toast.error(message);
    }
  }

  if (error) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <p className="text-sm text-destructive">
          Failed to load roles. Please try again.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Roles &amp; Permissions
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage action-level permissions for each role. Hard-locked actions
            are reserved for the Managing Partner.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Role list */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Roles ({roles.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              <>
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </>
            ) : (
              roles.map((role) => (
                <div
                  key={role.id}
                  className={`flex items-center justify-between rounded-md border p-3 cursor-pointer transition-colors ${
                    selectedRole?.id === role.id
                      ? "border-accent bg-accent/5"
                      : "hover:bg-muted"
                  }`}
                  onClick={() => setSelectedRole(role)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {role.is_seeded ? (
                      <ShieldCheck className="size-4 text-accent shrink-0" />
                    ) : (
                      <Shield className="size-4 text-muted-foreground shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {role.name.replace(/_/g, " ")}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        {role.is_seeded && (
                          <Badge variant="secondary" className="text-xs">
                            Seeded
                          </Badge>
                        )}
                        {role.is_custom && (
                          <Badge variant="outline" className="text-xs">
                            Custom
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCloneSourceId(role.id);
                      setCloneName(`${role.name}_clone`);
                      setCloneDialog(true);
                    }}
                  >
                    <Copy className="size-4" />
                    <span className="sr-only">Clone</span>
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Permission matrix */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {selectedRole
                ? `Permissions — ${selectedRole.name.replace(/_/g, " ")}`
                : "Select a role to view permissions"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedRole ? (
              <ScrollArea className="h-[60vh]">
                <div className="space-y-6 pr-4">
                  {PERMISSION_GROUPS.map((group) => (
                    <div key={group.label}>
                      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
                        {group.label}
                      </h3>
                      <div className="space-y-2">
                        {group.actions.map((action) => {
                          const isLocked =
                            selectedRole.hard_locked_actions?.includes(
                              action
                            ) && selectedRole.name !== "managing_partner";
                          const isEnabled =
                            selectedRole.permissions[action] === true;

                          return (
                            <div
                              key={action}
                              className="flex items-center justify-between py-1"
                            >
                              <div className="flex items-center gap-2">
                                {isLocked && (
                                  <Lock className="size-3 text-muted-foreground" />
                                )}
                                <span className="text-sm text-foreground">
                                  {action.replace(/_/g, " ")}
                                </span>
                              </div>
                              <Switch
                                checked={isEnabled}
                                disabled={isLocked || saving}
                                onCheckedChange={(val) =>
                                  handlePermToggle(
                                    selectedRole.id,
                                    action,
                                    val
                                  )
                                }
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
                Click a role on the left to manage its permissions.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Clone Dialog */}
      <Dialog open={cloneDialog} onOpenChange={setCloneDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clone Role</DialogTitle>
            <DialogDescription>
              Create a custom role by cloning an existing role&apos;s
              permissions. Hard-locked actions will not be carried over.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="clone-name">New Role Name</Label>
              <Input
                id="clone-name"
                value={cloneName}
                onChange={(e) => setCloneName(e.target.value)}
                placeholder="e.g. senior_manager"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setCloneDialog(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleClone}
                disabled={!cloneName.trim() || cloning}
              >
                {cloning ? "Cloning…" : "Clone"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
