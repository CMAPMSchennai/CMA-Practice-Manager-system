"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, UserCircle, Calendar, Building2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { EmployeeChecklistPanel } from "@/components/employees/EmployeeChecklistPanel";
import { DocumentVault } from "@/components/documents/DocumentVault";
import { EmployeeLoginAccessCard } from "@/components/employees/EmployeeLoginAccessCard";
import { EmployeePerformanceNotes } from "@/components/employees/EmployeePerformanceNotes";
import { ImportedDetailsCard, type ExtraDetails } from "@/components/records/ImportedDetailsCard";
import { EmployeePayIdCard } from "@/components/employees/EmployeePayIdCard";
import { ArticleshipExtras, EmployeeMoreDetails } from "@/components/employees/EmployeeMoreDetails";
import { loginAddressFor } from "@/lib/login-address";

interface Employee {
  id: string;
  employee_id_code: string;
  user_id: string | null;
  first_name: string;
  last_name: string | null;
  email: string | null;
  personal_email?: string | null;
  phone: string | null;
  position_type: string;
  designation: string | null;
  payroll_entity_id: string;
  date_of_joining: string | null;
  date_of_leaving: string | null;
  articleship_start_date: string | null;
  articleship_end_date: string | null;
  icai_membership_no: string | null;
  icai_registration_no: string | null;
  assigned_mentor_partner_id: string | null;
  status: string;
  confidentiality_undertaking_signed: boolean | null;
  created_at: string;
  extra_details?: ExtraDetails | null;
  salary?: number | null;
  pan?: string | null;
  aadhaar?: string | null;
  bank_account_no?: string | null;
  bank_ifsc?: string | null;
  pay_visible?: boolean;
  can_edit_pay?: boolean;
  can_view_all?: boolean;
  can_edit?: boolean;
}

const POSITION_LABELS: Record<string, string> = {
  partner: "Partner",
  paid_assistant: "Paid Assistant",
  articled_clerk: "Articled Clerk",
  support_staff: "Support Staff",
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

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-4 py-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground font-medium">{value ?? "—"}</dd>
    </div>
  );
}

export default function EmployeeDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params.id) return;
    setLoading(true);
    fetch(`/api/employees/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          toast.error(data.error);
          return;
        }
        setEmployee(data.employee ?? data);
      })
      .catch(() => toast.error("Failed to load employee"))
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <p className="text-muted-foreground">Employee not found.</p>
        <Button variant="link" onClick={() => router.push("/dashboard/employees")} className="mt-2 p-0">
          Back to Directory
        </Button>
      </div>
    );
  }

  // Staff who only see their own record get a plain "My profile" view (Gap #47).
  const viewAll = employee.can_view_all !== false;
  // Official email first; the personal email until the firm gives official ones (pilot).
  const login = loginAddressFor({
    email: employee.email,
    personal_email: employee.personal_email,
    imported_personal_email: employee.extra_details?.fields?.["Personal Email ID"],
  });
  const expiringClerk = employee.position_type === "articled_clerk" && isExpiringSoon(employee.articleship_end_date);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Back */}
      {viewAll ? (
        <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/employees")}>
          <ArrowLeft className="size-4 mr-2" />
          Back to Directory
        </Button>
      ) : (
        <h2 className="text-sm font-medium text-muted-foreground">My profile</h2>
      )}

      {/* Header card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <UserCircle className="size-8 text-primary-foreground" />
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold text-foreground">
                  {employee.first_name} {employee.last_name ?? ""}
                </h1>
                <Badge variant="secondary">{POSITION_LABELS[employee.position_type] ?? employee.position_type}</Badge>
                <Badge variant={employee.status === "active" ? "default" : "outline"}>
                  {employee.status}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{employee.employee_id_code}</p>
              {employee.designation && (
                <p className="text-sm text-muted-foreground">{employee.designation}</p>
              )}
            </div>
            {employee.can_edit === true && (
              <Button variant="outline" size="sm" onClick={() => router.push(`/dashboard/employees/${employee.id}/edit`)}>
                Edit details
              </Button>
            )}
          </div>
          {expiringClerk && (
            <div className="mt-4 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
              <AlertTriangle className="size-4 text-amber-600 shrink-0" />
              <p className="text-sm text-amber-700">
                Articleship expires on {formatDate(employee.articleship_end_date)} — within 60 days.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="profile">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          {viewAll && <TabsTrigger value="performance">Performance</TabsTrigger>}
          <TabsTrigger value="checklist">Onboarding Checklist</TabsTrigger>
          {employee.position_type === "articled_clerk" && (
            <TabsTrigger value="articleship">Articleship</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="profile" className="mt-4 space-y-4">
          {viewAll && (
            <EmployeeLoginAccessCard
              employeeId={employee.id}
              employeeEmail={login?.email ?? null}
              emailSource={login?.source ?? null}
              userId={employee.user_id}
              positionType={employee.position_type}
              onLinked={(userId) => setEmployee({ ...employee, user_id: userId })}
            />
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <UserCircle className="size-4" />
                Personal & Employment Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y divide-border">
                <DetailRow label="Email" value={employee.email} />
                <DetailRow label="Phone" value={employee.phone} />
                <DetailRow label="Date of Joining" value={formatDate(employee.date_of_joining)} />
                {employee.date_of_leaving && (
                  <DetailRow label="Date of Leaving" value={formatDate(employee.date_of_leaving)} />
                )}
                <DetailRow label="Position Type" value={POSITION_LABELS[employee.position_type] ?? employee.position_type} />
                <DetailRow label="Designation" value={employee.designation} />
                <DetailRow
                  label="Confidentiality Undertaking"
                  value={
                    <Badge variant={employee.confidentiality_undertaking_signed ? "default" : "outline"}>
                      {employee.confidentiality_undertaking_signed ? "Signed" : "Pending"}
                    </Badge>
                  }
                />
              </dl>
            </CardContent>
          </Card>
          <EmployeePayIdCard
            employeeId={employee.id}
            values={{
              salary: employee.salary ?? null,
              pan: employee.pan ?? null,
              aadhaar: employee.aadhaar ?? null,
              bank_account_no: employee.bank_account_no ?? null,
              bank_ifsc: employee.bank_ifsc ?? null,
            }}
            visible={employee.pay_visible === true}
            canEdit={employee.can_edit_pay === true}
            onSaved={(v) => setEmployee({ ...employee, ...v })}
          />
          <EmployeeMoreDetails employee={employee as unknown as Record<string, unknown>} payVisible={employee.pay_visible === true} />
          <ImportedDetailsCard extras={employee.extra_details} />
        </TabsContent>

        {viewAll && (
          <TabsContent value="performance" className="mt-4">
            <EmployeePerformanceNotes employeeId={employee.id} />
          </TabsContent>
        )}

        <TabsContent value="documents" className="mt-4">
          <DocumentVault ownerType="employee" ownerId={employee.id} title="Employee Documents" />
        </TabsContent>

        <TabsContent value="checklist" className="mt-4">
          <EmployeeChecklistPanel employeeId={employee.id} canEdit={employee.can_edit === true} />
        </TabsContent>

        {employee.position_type === "articled_clerk" && (
          <TabsContent value="articleship" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="size-4" />
                  Articleship Tracking
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="divide-y divide-border">
                  <DetailRow label="ICAI Registration No. (SRN)" value={employee.icai_registration_no} />
                  <ArticleshipExtras employee={employee as unknown as Record<string, unknown>} />
                  <DetailRow label="Start Date" value={formatDate(employee.articleship_start_date)} />
                  <DetailRow
                    label="End Date"
                    value={
                      <span className={expiringClerk ? "text-amber-600 font-semibold" : ""}>
                        {formatDate(employee.articleship_end_date)}
                        {expiringClerk && " ⚠ Expiring soon"}
                      </span>
                    }
                  />
                </dl>
                {expiringClerk && (
                  <>
                    <Separator className="my-4" />
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                      <p className="text-sm font-medium text-amber-800">
                        Action required: Articleship completion approaching
                      </p>
                      <p className="text-xs text-amber-700 mt-1">
                        Please initiate the articleship completion process on the ICAI self-service portal.
                        A notification has been queued.
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
