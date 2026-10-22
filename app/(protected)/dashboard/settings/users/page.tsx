"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Users,
  Search,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Clock,
  KeyRound,
  Link2,
  Unlink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  OneTimeCredentialsDialog,
  type IssuedCredentials,
} from "@/components/settings/OneTimeCredentialsDialog";

interface UserRow {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string | null;
  role_id: string | null;
  role_name: string | null;
  is_active: boolean;
  last_active_at: string | null;
  created_at: string;
  linked_employee_id: string | null;
  linked_employee_name: string | null;
  linked_employee_code: string | null;
  password_setup_pending: boolean;
}

interface LinkableEmployee {
  id: string;
  employee_id_code: string;
  name: string;
  email: string | null;
}

interface RoleOption {
  id: string;
  name: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

function initials(name: string | null, email: string | null): string {
  if (name) {
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  return (email ?? "U")[0].toUpperCase();
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

export default function UserManagementPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [assignDialogUser, setAssignDialogUser] = useState<UserRow | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("none");
  const [saving, setSaving] = useState(false);
  const [issuingFor, setIssuingFor] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedCredentials | null>(null);
  const [linkDialogUser, setLinkDialogUser] = useState<UserRow | null>(null);
  const [linkableEmployees, setLinkableEmployees] = useState<LinkableEmployee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [linking, setLinking] = useState(false);
  const [unlinkDialogUser, setUnlinkDialogUser] = useState<UserRow | null>(null);
  const [unlinking, setUnlinking] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "20",
      });
      if (search) params.set("search", search);
      if (activeFilter !== "all") params.set("is_active", String(activeFilter === "active"));

      const res = await fetch(`/api/settings/users?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Failed to load users.");
        return;
      }
      setUsers(Array.isArray(json?.users) ? json.users : []);
      setPagination(json?.pagination ?? null);
    } catch {
      toast.error("Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, [page, search, activeFilter]);

  const loadRoles = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/roles");
      const json = await res.json();
      setRoles(Array.isArray(json?.roles) ? json.roles : []);
    } catch {
      // non-blocking
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  // Reset to page 1 when search/filter changes
  useEffect(() => {
    setPage(1);
  }, [search, activeFilter]);

  async function toggleActive(user: UserRow) {
    const newValue = !user.is_active;
    try {
      const res = await fetch(`/api/settings/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: newValue }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Failed to update user.");
        return;
      }
      setUsers((prev) =>
        prev.map((u2) =>
          u2.id === user.id ? { ...u2, is_active: newValue } : u2,
        ),
      );
      toast.success(
        `${user.name ?? user.email ?? "User"} ${newValue ? "activated" : "deactivated"}.`,
      );
    } catch {
      toast.error("Failed to update user.");
    }
  }

  async function issueOneTimePassword(user: UserRow) {
    setIssuingFor(user.id);
    try {
      const res = await fetch(`/api/settings/users/${user.id}/temporary-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ send_email: true }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Could not issue a one-time password.");
        return;
      }
      setIssued(json as IssuedCredentials);
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, password_setup_pending: true } : u)),
      );
    } catch {
      toast.error("Could not issue a one-time password.");
    } finally {
      setIssuingFor(null);
    }
  }

  async function openLinkDialog(user: UserRow) {
    setLinkDialogUser(user);
    setSelectedEmployeeId("");
    try {
      const res = await fetch("/api/settings/users/linkable-employees");
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Failed to load employees.");
        return;
      }
      const list: LinkableEmployee[] = Array.isArray(json?.employees) ? json.employees : [];
      setLinkableEmployees(list);
      // Pre-select the employee whose email matches the login, if any.
      const match = list.find(
        (e) => e.email && user.email && e.email.toLowerCase() === user.email.toLowerCase(),
      );
      if (match) setSelectedEmployeeId(match.id);
    } catch {
      toast.error("Failed to load employees.");
    }
  }

  async function saveEmployeeLink() {
    if (!linkDialogUser || !selectedEmployeeId) return;
    setLinking(true);
    try {
      const res = await fetch(`/api/settings/users/${linkDialogUser.id}/link-employee`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_id: selectedEmployeeId }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Failed to link employee.");
        return;
      }
      const employee = linkableEmployees.find((e) => e.id === selectedEmployeeId);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === linkDialogUser.id
            ? {
                ...u,
                linked_employee_id: selectedEmployeeId,
                linked_employee_name: employee?.name ?? null,
                linked_employee_code: employee?.employee_id_code ?? null,
              }
            : u,
        ),
      );
      toast.success("Login linked to employee.");
      setLinkDialogUser(null);
    } catch {
      toast.error("Failed to link employee.");
    } finally {
      setLinking(false);
    }
  }

  async function confirmUnlink() {
    if (!unlinkDialogUser) return;
    setUnlinking(true);
    try {
      const res = await fetch(`/api/settings/users/${unlinkDialogUser.id}/unlink-employee`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "Could not unlink the staff record.");
        return;
      }
      setUsers((prev) =>
        prev.map((u) =>
          u.id === unlinkDialogUser.id
            ? { ...u, linked_employee_id: null, linked_employee_name: null, linked_employee_code: null }
            : u,
        ),
      );
      toast.success("Staff record unlinked. It can now be linked to another login.");
      setUnlinkDialogUser(null);
    } catch {
      toast.error("Could not unlink the staff record.");
    } finally {
      setUnlinking(false);
    }
  }

  function openAssignDialog(user: UserRow) {
    setAssignDialogUser(user);
    setSelectedRoleId(user.role_id ?? "none");
  }

  async function saveRoleAssignment() {
    if (!assignDialogUser) return;
    setSaving(true);
    try {
      const payload: { role_id: string | null } = {
        role_id: selectedRoleId === "none" ? null : selectedRoleId,
      };
      const res = await fetch(`/api/settings/users/${assignDialogUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Failed to assign role.");
        return;
      }
      const roleName =
        roles.find((r) => r.id === payload.role_id)?.name ?? null;
      setUsers((prev) =>
        prev.map((u) =>
          u.id === assignDialogUser.id
            ? { ...u, role_id: payload.role_id, role_name: roleName }
            : u,
        ),
      );
      toast.success("Role updated successfully.");
      setAssignDialogUser(null);
    } catch {
      toast.error("Failed to assign role.");
    } finally {
      setSaving(false);
    }
  }

  const totalActive = users.filter((u) => u.is_active).length;
  const totalInactive = users.filter((u) => !u.is_active).length;
  const totalWithRole = users.filter((u) => u.role_id).length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            User Management
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            User directory, role assignment, activate / deactivate, and access
            history.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => loadUsers()}
          disabled={loading}
        >
          <RefreshCw className={`size-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total users", value: pagination?.total ?? users.length },
          { label: "Active (this page)", value: totalActive },
          { label: "Inactive (this page)", value: totalInactive },
          { label: "With role assigned", value: totalWithRole },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              {loading ? (
                <Skeleton className="h-7 w-10 mb-1" />
              ) : (
                <p className="text-2xl font-semibold text-foreground">
                  {stat.value}
                </p>
              )}
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search + filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={activeFilter}
          onValueChange={(v) => setActiveFilter(v as "all" | "active" | "inactive")}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All users</SelectItem>
            <SelectItem value="active">Active only</SelectItem>
            <SelectItem value="inactive">Inactive only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="size-4" />
            Users
            {pagination && (
              <span className="text-muted-foreground font-normal text-sm ml-1">
                ({pagination.total} total)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">
                    Practice role
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">
                    Last active
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Skeleton className="size-8 rounded-full" />
                            <div className="space-y-1">
                              <Skeleton className="h-4 w-28" />
                              <Skeleton className="h-3 w-36" />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <Skeleton className="h-4 w-24" />
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <Skeleton className="h-4 w-20" />
                        </td>
                        <td className="px-4 py-3">
                          <Skeleton className="h-5 w-14" />
                        </td>
                        <td className="px-4 py-3">
                          <Skeleton className="h-8 w-20 ml-auto" />
                        </td>
                      </tr>
                    ))
                  : users.length === 0
                    ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-10 text-center text-sm text-muted-foreground"
                        >
                          No users found.
                        </td>
                      </tr>
                    )
                    : users.map((user) => (
                      <tr
                        key={user.id}
                        className="hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar className="size-8">
                              <AvatarImage src={user.image ?? undefined} />
                              <AvatarFallback className="text-xs">
                                {initials(user.name, user.email)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-foreground text-sm">
                                {user.name ?? "—"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {user.email ?? "—"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {user.linked_employee_id
                                  ? `Employee: ${user.linked_employee_name ?? "—"}${
                                      user.linked_employee_code
                                        ? ` (${user.linked_employee_code})`
                                        : ""
                                    }`
                                  : "Not linked to an employee"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          {user.role_name ? (
                            <Badge variant="secondary" className="text-xs">
                              {user.role_name.replace(/_/g, " ")}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Unassigned
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell text-sm text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <Clock className="size-3 shrink-0" />
                            {formatDate(user.last_active_at)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col items-start gap-1">
                            <Badge
                              variant={user.is_active ? "default" : "outline"}
                              className="text-xs"
                            >
                              {user.is_active ? "Active" : "Inactive"}
                            </Badge>
                            {user.password_setup_pending && (
                              <Badge variant="outline" className="text-xs">
                                Password setup pending
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {!user.linked_employee_id && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openLinkDialog(user)}
                                title="Link to employee"
                              >
                                <Link2 className="size-4 mr-1" />
                                <span className="hidden sm:inline">Link employee</span>
                              </Button>
                            )}
                            {user.linked_employee_id && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setUnlinkDialogUser(user)}
                                title="Free the staff record linked to this login"
                              >
                                <Unlink className="size-4 mr-1" />
                                <span className="hidden sm:inline">Unlink employee</span>
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => issueOneTimePassword(user)}
                              disabled={issuingFor === user.id || !user.is_active}
                              title={
                                user.is_active
                                  ? "Issue a new one-time password and email it"
                                  : "Reactivate this user first"
                              }
                            >
                              <KeyRound className="size-4 mr-1" />
                              <span className="hidden sm:inline">
                                {issuingFor === user.id ? "Issuing…" : "One-time password"}
                              </span>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openAssignDialog(user)}
                              title="Assign role"
                            >
                              <ShieldCheck className="size-4 mr-1" />
                              <span className="hidden sm:inline">Role</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => toggleActive(user)}
                              title={
                                user.is_active ? "Deactivate" : "Activate"
                              }
                            >
                              {user.is_active ? (
                                <ToggleRight className="size-4 mr-1 text-green-600" />
                              ) : (
                                <ToggleLeft className="size-4 mr-1" />
                              )}
                              <span className="hidden sm:inline">
                                {user.is_active ? "Deactivate" : "Activate"}
                              </span>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination && pagination.total_pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-xs text-muted-foreground">
                Page {pagination.page} of {pagination.total_pages} ·{" "}
                {pagination.total} users
              </p>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPage((p) => Math.min(pagination.total_pages, p + 1))
                  }
                  disabled={page >= pagination.total_pages || loading}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Role Assignment Dialog */}
      <Dialog
        open={!!assignDialogUser}
        onOpenChange={(open) => !open && setAssignDialogUser(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Practice Role</DialogTitle>
            <DialogDescription>
              {assignDialogUser?.name ?? assignDialogUser?.email ?? "User"} —
              select a practice role from the list below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">
                Practice role
              </label>
              <Select
                value={selectedRoleId}
                onValueChange={setSelectedRoleId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a role…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No role assigned</SelectItem>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setAssignDialogUser(null)}
              >
                Cancel
              </Button>
              <Button onClick={saveRoleAssignment} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Link to employee (Gap #16b) */}
      <Dialog
        open={!!linkDialogUser}
        onOpenChange={(open) => !open && setLinkDialogUser(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Link to employee</DialogTitle>
            <DialogDescription>
              {linkDialogUser?.name ?? linkDialogUser?.email ?? "User"} — choose the employee
              record this login belongs to. Linked users appear in task assignment and payroll.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 mt-2">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-foreground">Employee</label>
              <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an employee…" />
                </SelectTrigger>
                <SelectContent>
                  {linkableEmployees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name} ({e.employee_id_code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {linkableEmployees.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Every current employee already has a login.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setLinkDialogUser(null)}>
                Cancel
              </Button>
              <Button onClick={saveEmployeeLink} disabled={!selectedEmployeeId || linking}>
                {linking ? "Linking…" : "Link"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Unlink a login from its staff record (added feature, 16 Oct) */}
      <Dialog
        open={!!unlinkDialogUser}
        onOpenChange={(open) => !open && setUnlinkDialogUser(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Unlink staff record</DialogTitle>
            <DialogDescription>
              {unlinkDialogUser?.name ?? unlinkDialogUser?.email ?? "This login"} is linked to{" "}
              {unlinkDialogUser?.linked_employee_name ?? "a staff record"}
              {unlinkDialogUser?.linked_employee_code ? ` (${unlinkDialogUser.linked_employee_code})` : ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 mt-2 text-sm text-foreground">
            <ul className="list-disc space-y-1 pl-5">
              <li>Nothing is deleted. The login, the staff record and the tasks assigned to the login stay as they are.</li>
              <li>The staff record becomes free, and can then be linked to another login with Link employee.</li>
              <li>Until it is linked again, this login will not show in task assignment or payroll.</li>
            </ul>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setUnlinkDialogUser(null)}>
                Cancel
              </Button>
              <Button onClick={confirmUnlink} disabled={unlinking}>
                {unlinking ? "Unlinking…" : "Unlink"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* One-time password (Gap #16a) */}
      <OneTimeCredentialsDialog issued={issued} onClose={() => setIssued(null)} />
    </div>
  );
}
