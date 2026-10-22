"use client";

import { toast } from "sonner";
import { Copy, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface IssuedCredentials {
  email: string | null;
  temporary_password: string;
  expires_at: string;
  login_url: string;
  /** Set when the screen asked for the details to be emailed to the person. */
  email_requested?: boolean;
  emailed?: boolean;
  email_error?: string;
}

function formatExpiry(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error("Could not copy — select and copy it manually");
  }
}

/**
 * Shows an admin-issued one-time password once (Gap #14 / #16a), with the
 * sign-in link and email, each copyable. Closing it hides the password for good.
 */
export function OneTimeCredentialsDialog({
  issued,
  fallbackEmail,
  onClose,
}: {
  issued: IssuedCredentials | null;
  fallbackEmail?: string | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={issued !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>One-time login details</DialogTitle>
          <DialogDescription>
            Share these privately with the user. The password is shown only now and expires
            {issued ? ` on ${formatExpiry(issued.expires_at)}` : ""}. They must set their own
            password when they first sign in.
          </DialogDescription>
        </DialogHeader>
        {issued && (
          <div className="flex flex-col gap-3">
            {[
              { label: "Sign-in page", value: issued.login_url },
              { label: "Email", value: issued.email ?? fallbackEmail ?? "" },
              { label: "One-time password", value: issued.temporary_password },
            ].map((row) => (
              <div key={row.label} className="flex flex-col gap-1">
                <Label>{row.label}</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-md border bg-muted px-3 py-2 text-sm break-all">
                    {row.value}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={`Copy ${row.label}`}
                    onClick={() => copy(row.value, row.label)}
                  >
                    <Copy className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
            {issued.email_requested && (
              <div
                className="rounded-md border px-3 py-2 text-sm text-foreground"
                role="status"
              >
                {issued.emailed
                  ? `These details were also emailed to ${issued.email ?? fallbackEmail ?? "the person"}.`
                  : `The email could not be sent: ${issued.email_error ?? "unknown reason"}. Share the details above instead.`}
              </div>
            )}
            <div className="flex items-start gap-2 rounded-md border px-3 py-2">
              <ShieldAlert className="size-4 mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                Closing this window hides the password permanently. If it is lost, issue a new one.
              </p>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
