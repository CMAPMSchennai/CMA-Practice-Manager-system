"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { EmployeeForm } from "@/components/employees/EmployeeForm";

export default function EmployeeOnboardingPage() {
  const router = useRouter();

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/employees")}>
          <ArrowLeft className="size-4 mr-2" />
          Back to Directory
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Employee Onboarding</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Fill in the ten sections below. The employee ID is generated automatically (for example CMA-AC01 for articled clerks) and the
          document checklist is created for the position. Documents are uploaded as softcopy on the employee&apos;s page afterwards.
        </p>
      </div>

      <EmployeeForm
        mode="create"
        onSuccess={(emp) => router.push(`/dashboard/employees/${emp.id}`)}
        onCancel={() => router.push("/dashboard/employees")}
      />
    </div>
  );
}
