"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Briefcase,
  Search,
  Plus,
  RefreshCw,
  AlertTriangle,
  Filter,
  UserCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip, type StatusTone } from "@/components/ui/status-chip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmployeeForm } from "@/components/employees/EmployeeForm";

interface Employee {
  id: string;
  employee_id_code: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  position_type: string;
  designation: string | null;
  payroll_entity_id: string;
  date_of_joining: string | null;
  articleship_end_date: string | null;
  status: string;
  created_at: string;
}

const POSITION_LABELS: Record<string, string> = {
  partner: "Partner",
  paid_assistant: "Paid Assistant",
  articled_clerk: "Articled Clerk",
  support_staff: "Support Staff",
};

const STATUS_TONES: Record<string, StatusTone> = {
  active: "ok",
  inactive: "neutral",
  on_leave: "warn",
};

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
  });
}

function isExpiringSoon(dateStr: string | null) {
  if (!dateStr) return false;
  const diff = new Date(dateStr).getTime() - Date.now();
  return diff > 0 && diff < 60 * 24 * 60 * 60 * 1000;
}

export default function EmployeeDirectoryPage() {
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expiringAlert, setExpiringAlert] = useState<Employee[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [canCreate, setCanCreate] = useState(false);

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page_size: "100" });
      if (positionFilter !== "all") params.set("position_type", positionFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/employees?${params}`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to load employees");
        return;
      }
      setCanCreate(data?.can_create === true);
      const list: Employee[] = Array.isArray(data?.employees) ? data.employees : [];
      setEmployees(list);
      setExpiringAlert(list.filter((e) => e.position_type === "articled_clerk" && isExpiringSoon(e.articleship_end_date)));
    } catch {
      toast.error("Failed to load employees");
    } finally {
      setLoading(false);
    }
  }, [positionFilter, statusFilter]);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);

  const filtered = employees.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.employee_id_code?.toLowerCase().includes(q) ||
      e.first_name?.toLowerCase().includes(q) ||
      e.last_name?.toLowerCase().includes(q) ||
      e.email?.toLowerCase().includes(q) ||
      e.designation?.toLowerCase().includes(q)
    );
  });

  const statCounts = {
    total: employees.length,
    active: employees.filter((e) => e.status === "active").length,
    clerks: employees.filter((e) => e.position_type === "articled_clerk").length,
    partners: employees.filter((e) => e.position_type === "partner").length,
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Briefcase className="size-6 text-primary" />
            Employee Directory
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage staff, track articleship, and monitor onboarding status.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadEmployees} disabled={loading}>
            <RefreshCw className="size-4 mr-2" /> Refresh
          </Button>
          {canCreate && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4 mr-2" /> Add Employee
            </Button>
          )}
        </div>
      </div>

      {/* Alert strip for expiring articleships */}
      {expiringAlert.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 flex items-start gap-3">
          <AlertTriangle className="size-4 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800">
              {expiringAlert.length} articleship{expiringAlert.length > 1 ? "s" : ""} expiring within 60 days
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              {expiringAlert.map((e) => `${e.first_name} ${e.last_name ?? ""} (${e.employee_id_code})`).join(", ")}
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Staff", value: statCounts.total, icon: <UserCheck className="size-4" /> },
          { label: "Active", value: statCounts.active, icon: null },
          { label: "Partners", value: statCounts.partners, icon: null },
          { label: "Articled Clerks", value: statCounts.clerks, icon: null },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              {loading ? (
                <Skeleton className="h-7 w-10 mb-1" />
              ) : (
                <p className="text-2xl font-semibold text-foreground">{s.value}</p>
              )}
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, ID, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={positionFilter} onValueChange={setPositionFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <Filter className="size-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Position type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All positions</SelectItem>
            <SelectItem value="partner">Partner</SelectItem>
            <SelectItem value="paid_assistant">Paid Assistant</SelectItem>
            <SelectItem value="articled_clerk">Articled Clerk</SelectItem>
            <SelectItem value="support_staff">Support Staff</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="on_leave">On Leave</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Employees ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Employee</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Position</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Joined</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Articleship End</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading
                  ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3"><Skeleton className="h-5 w-40" /></td>
                      <td className="px-4 py-3 hidden sm:table-cell"><Skeleton className="h-5 w-24" /></td>
                      <td className="px-4 py-3 hidden md:table-cell"><Skeleton className="h-5 w-20" /></td>
                      <td className="px-4 py-3 hidden lg:table-cell"><Skeleton className="h-5 w-20" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-5 w-16" /></td>
                    </tr>
                  ))
                  : filtered.length === 0
                    ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                          No employees found.
                        </td>
                      </tr>
                    )
                    : filtered.map((emp) => (
                      <tr
                        key={emp.id}
                        className="hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => router.push(`/dashboard/employees/${emp.id}`)}
                      >
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-foreground">
                              {emp.first_name} {emp.last_name ?? ""}
                            </p>
                            <p className="text-xs text-muted-foreground">{emp.employee_id_code}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <Badge variant="secondary" className="text-xs">
                            {POSITION_LABELS[emp.position_type] ?? emp.position_type}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                          {formatDate(emp.date_of_joining)}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          {emp.position_type === "articled_clerk" ? (
                            <span className={isExpiringSoon(emp.articleship_end_date) ? "text-amber-600 font-medium" : "text-muted-foreground"}>
                              {formatDate(emp.articleship_end_date)}
                              {isExpiringSoon(emp.articleship_end_date) && " ⚠"}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <StatusChip tone={STATUS_TONES[emp.status ?? "active"] ?? "neutral"}>
                            {String(emp.status ?? "active").replace(/_/g, " ")}
                          </StatusChip>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create employee dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Employee</DialogTitle>
          </DialogHeader>
          <EmployeeForm
            onSuccess={() => { setCreateOpen(false); loadEmployees(); }}
            onCancel={() => setCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
