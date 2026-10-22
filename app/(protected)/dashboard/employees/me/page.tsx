"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * "My profile" (Gap #47). Staff who may see only their own employee record
 * land here from the menu and are taken straight to it.
 */
export default function MyProfilePage() {
  const router = useRouter();
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    fetch("/api/employees?page_size=1")
      .then((r) => r.json())
      .then((d: { employees?: { id: string }[] }) => {
        const mine = d.employees?.[0];
        if (mine) router.replace(`/dashboard/employees/${mine.id}`);
        else setMissing(true);
      })
      .catch(() => setMissing(true));
  }, [router]);

  if (missing) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="rounded-md border bg-card p-6 max-w-lg">
          <h1 className="text-lg font-semibold text-foreground">No profile yet</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your login isn&apos;t linked to an employee record yet. Ask a Managing Partner or Admin to link it.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
