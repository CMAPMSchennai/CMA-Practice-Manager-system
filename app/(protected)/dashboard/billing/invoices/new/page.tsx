"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { InvoiceForm } from "@/components/billing/InvoiceForm";

export default function NewInvoicePage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/billing">
            <ChevronLeft className="size-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Create Invoice</h1>
          <p className="text-sm text-muted-foreground">
            Multi-engagement invoice builder with GST logic
          </p>
        </div>
      </div>

      <InvoiceForm />
    </div>
  );
}
