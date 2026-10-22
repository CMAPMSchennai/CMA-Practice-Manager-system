"use client";

import Link from "next/link";
import { ArrowLeft, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropboxIntegrationWidget } from "@/components/settings/DropboxIntegrationWidget";
import { EmailTestCard } from "@/components/settings/EmailTestCard";

export default function IntegrationsSettingsPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/settings">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Plug className="size-5 text-muted-foreground" />
            Integrations
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage third-party integrations for document storage, email, and
            more.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-4xl">
        <DropboxIntegrationWidget />
        <EmailTestCard />
      </div>

      <div className="max-w-4xl rounded-md border border-border bg-muted/20 p-4">
        <p className="text-sm font-medium text-foreground mb-1">
          Additional Integrations (Phase 2)
        </p>
        <p className="text-xs text-muted-foreground">
          Tally connector, GSTN portal, Income Tax portal (26AS/AIS), MCA V3
          filing status, WhatsApp Business API, and e-Sign for engagement
          letters are planned for Phase 2. Only Dropbox (document vault) and
          Resend (transactional email) are active in Phase 1.
        </p>
      </div>
    </div>
  );
}
