"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmployeeForm } from "@/components/employees/EmployeeForm";

export default function EditEmployeePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [employee, setEmployee] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params.id) return;
    fetch(`/api/employees/${params.id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) toast.error(d.error);
        else setEmployee(d.employee ?? null);
      })
      .catch(() => toast.error("Failed to load employee"))
      .finally(() => setLoading(false));
  }, [params.id]);

  const back = () => router.push(`/dashboard/employees/${params.id}`);

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 max-w-3xl">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!employee || employee.can_edit !== true) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <p className="text-muted-foreground">{employee ? "You do not have permission to edit this employee." : "Employee not found."}</p>
        <Button variant="link" className="mt-2 p-0" onClick={() => router.push("/dashboard/employees")}>
          Back to Directory
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-3xl">
      <Button variant="ghost" size="sm" onClick={back}>
        <ArrowLeft className="size-4 mr-2" />
        Back to {String(employee.first_name ?? "employee")}
      </Button>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Edit details</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {String(employee.first_name ?? "")} {String(employee.last_name ?? "")} · {String(employee.employee_id_code ?? "")}
        </p>
      </div>
      <EmployeeForm
        mode="edit"
        employeeId={params.id}
        initial={employee}
        payVisible={employee.pay_visible === true && employee.can_edit_pay === true}
        onSuccess={back}
        onCancel={back}
      />
    </div>
  );
}
