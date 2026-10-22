"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EncryptionStatusCard } from "@/components/settings/EncryptionStatusCard";
import { AutomationCard } from "@/components/settings/AutomationCard";
import {
  Shield,
  Users,
  Building2,
  Database,
  Upload,
  Plug,
} from "lucide-react";

const SETTINGS_SECTIONS = [
  {
    title: "Roles & Permissions",
    description:
      "Manage action-level permissions matrix, seeded roles, and custom clones.",
    href: "/dashboard/settings/roles",
    icon: <Shield className="size-5 text-accent" />,
  },
  {
    title: "User Management",
    description:
      "User directory, role assignment, activate/deactivate, and access history.",
    href: "/dashboard/settings/users",
    icon: <Users className="size-5 text-accent" />,
  },
  {
    title: "Entity Master",
    description:
      "Entity directory with bank accounts and payroll readiness thresholds.",
    href: "/dashboard/settings/entities",
    icon: <Building2 className="size-5 text-accent" />,
  },
  {
    title: "Reference Data",
    description:
      "Generic lookup CRUD for all system enumerations (fee basis, entity types, etc.)",
    href: "/dashboard/settings/reference-data",
    icon: <Database className="size-5 text-accent" />,
  },
  {
    title: "Document types",
    description:
      "Which category (KYC, Banking, Statutory...) each document type belongs to, and add new types.",
    href: "/dashboard/settings/document-types",
    icon: <Database className="size-5 text-accent" />,
  },
  {
    title: "GST rates",
    description:
      "The GST percentages a fee line on an invoice can use, and the one a new line starts with.",
    href: "/dashboard/settings/gst-rates",
    icon: <Database className="size-5 text-accent" />,
  },
  {
    title: "Data Migration",
    description:
      "Import utility: dry-run, validation, rollback, and duplicate review queue.",
    href: "/dashboard/settings/migration",
    icon: <Upload className="size-5 text-accent" />,
  },
  {
    title: "Security",
    description:
      "Two-step sign-in (authenticator app), reset a lost phone, and the audit trail check.",
    href: "/dashboard/security",
    icon: <Shield className="size-5 text-accent" />,
  },
  {
    title: "Clear test data",
    description:
      "Managing Partner only. Remove test engagements and their tasks. Invoices are kept.",
    href: "/dashboard/settings/clear-test-data",
    icon: <Database className="size-5 text-accent" />,
  },
  {
    title: "Integrations",
    description:
      "Dropbox document vault, Resend email, and third-party integration status.",
    href: "/dashboard/settings/integrations",
    icon: <Plug className="size-5 text-accent" />,
  },
];

export default function SettingsIndexPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage system configuration, roles, entities, and reference data.
        </p>
      </div>

      <EncryptionStatusCard />
      <AutomationCard />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {SETTINGS_SECTIONS.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="h-full hover:bg-muted/30 transition-colors cursor-pointer">
              <CardHeader className="flex flex-row items-center gap-3 pb-2">
                {s.icon}
                <CardTitle className="text-sm font-medium">
                  {s.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {s.description}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
