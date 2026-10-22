"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound, UserPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  OneTimeCredentialsDialog,
  type IssuedCredentials,
} from "@/components/settings/OneTimeCredentialsDialog";

interface Role {
  id: string;
  name: string;
}

interface EmployeeLoginAccessCardProps {
  employeeId: string;
  employeeEmail: string | null;
  /** Where that address came from; "personal" is the pilot fallback. */
  emailSource?: "official" | "personal" | null;
  /** users.id linked to this employee, if a login already exists. */
  userId: string | null;
  positionType: string;
  onLinked: (userId: string) => void;
}

/** Pre-selected role for a position type; Admin is never pre-selected. */
const POSITION_DEFAULT_ROLE: Record<string, string> = {
  partner: "partner",
  paid_assistant: "paid_assistant",
  articled_clerk: "articled_clerk",
};

function roleLabel(name: string) {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function EmployeeLoginAccessCard({
  employeeId,
  employeeEmail,
  emailSource,
  userId,
  positionType,
  onLinked,
}: EmployeeLoginAccessCardProps) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [roleId, setRoleId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);
  const [issued, setIssued] = useState<IssuedCredentials | null>(null);

  useEffect(() => {
    if (!createOpen || roles.length > 0) return;
    fetch("/api/settings/roles")
      .then((r) => r.json())
      .then((data: { roles?: Role[]; error?: string }) => {
        if (data.error) {
          toast.error(data.error);
          return;
        }
        const list = data.roles ?? [];
        setRoles(list);
        const preferred = list.find((r) => r.name === POSITION_DEFAULT_ROLE[positionType]);
        if (preferred) setRoleId(preferred.id);
      })
      .catch(() => toast.error("Failed to load roles"));
  }, [createOpen, roles.length, positionType]);

  async function createLogin() {
    if (!roleId) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/settings/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_id: employeeId, role_id: roleId, send_email: sendEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Could not create the login");
        return;
      }
      setCreateOpen(false);
      setIssued(data as IssuedCredentials);
      onLinked(data.user_id as string);
    } catch {
      toast.error("Could not create the login");
    } finally {
      setSubmitting(false);
    }
  }

  async function issueNewPassword() {
    if (!userId) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/settings/users/${userId}/temporary-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ send_email: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Could not issue a one-time password");
        return;
      }
      setIssued(data as IssuedCredentials);
    } catch {
      toast.error("Could not issue a one-time password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <KeyRound className="size-4" />
          Login Access
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {userId ? (
          <>
            <div className="flex items-center gap-2">
              <Badge>Login created</Badge>
              <span className="text-sm text-muted-foreground">{employeeEmail}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              If the one-time password expired or was lost, issue a new one. It is also emailed to
              the person. They will have to set their own password again on next login.
            </p>
            <Button variant="outline" onClick={issueNewPassword} disabled={submitting}>
              <KeyRound className="size-4 mr-2" />
              {submitting ? "Issuing…" : "Issue new one-time password"}
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              This employee cannot sign in yet. Create a login to give them a one-time password.
              Tasks can only be assigned once their onboarding checklist is complete.
            </p>
            <Button onClick={() => setCreateOpen(true)} disabled={!employeeEmail}>
              <UserPlus className="size-4 mr-2" />
              Create login
            </Button>
            {!employeeEmail && (
              <p className="text-xs text-muted-foreground">
                Add the employee&apos;s official or personal email address first.
              </p>
            )}
            {employeeEmail && emailSource === "personal" && (
              <p className="text-xs text-muted-foreground">
                No official email is set, so the personal email {employeeEmail} will be used. Add an official email
                in section 10 of the staff form to use that instead.
              </p>
            )}
          </>
        )}
      </CardContent>

      {/* Create login — pick role */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create login</DialogTitle>
            <DialogDescription>
              A login will be created for {employeeEmail} with a one-time password valid for 24 hours.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="login-role">Role</Label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger id="login-role">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {roleLabel(r.name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-start gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="mt-1"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
            />
            <span>
              Also email the sign-in details to {employeeEmail}. Check that address is right first.
            </span>
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={createLogin} disabled={!roleId || submitting}>
              {submitting ? "Creating…" : "Create login"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <OneTimeCredentialsDialog
        issued={issued}
        fallbackEmail={employeeEmail}
        onClose={() => setIssued(null)}
      />
    </Card>
  );
}
