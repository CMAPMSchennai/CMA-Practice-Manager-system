"use client";

import { useEffect, useState } from "react";
import {
  Cloud,
  CheckCircle2,
  XCircle,
  RefreshCw,
  HardDrive,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

interface DropboxStatus {
  connected: boolean;
  storage_used_bytes: number | null;
  storage_quota_bytes: number | null;
  message?: string;
}

function formatGB(bytes: number | null) {
  if (bytes === null) return "—";
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function DropboxIntegrationWidget() {
  const [status, setStatus] = useState<DropboxStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadStatus() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dropbox/status");
      if (res.status === 401) {
        setError("You must be signed in to view integration status.");
        return;
      }
      if (res.status === 403) {
        setError(
          "You do not have permission to view integration status. This is restricted to admins and managing partners.",
        );
        return;
      }
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to load Dropbox status.");
        return;
      }
      setStatus(json);
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message.trim()
          ? err.message
          : "Something went wrong.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  const [diagBusy, setDiagBusy] = useState(false);
  const [diagText, setDiagText] = useState<string | null>(null);

  async function runDiagnosis() {
    setDiagBusy(true);
    setDiagText(null);
    try {
      const res = await fetch("/api/dropbox/diagnose", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      setDiagText(JSON.stringify(json, null, 2));
    } catch {
      setDiagText("Could not reach the server.");
    } finally {
      setDiagBusy(false);
    }
  }

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function runFolderTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/dropbox/test-folder", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (json.ok) {
        setTestResult({ ok: true, text: "Dropbox created the folder CMA-PMS-test. Check your Dropbox to see it." });
      } else {
        const raw = typeof json.error === "string" ? json.error : JSON.stringify(json.error ?? json);
        const exists = raw.includes("conflict");
        setTestResult({
          ok: exists,
          text: exists
            ? "The folder CMA-PMS-test already exists, so creating folders works."
            : `Dropbox said no (status ${json.status ?? res.status}): ${raw}`,
        });
      }
    } catch {
      setTestResult({ ok: false, text: "Could not reach the server." });
    } finally {
      setTesting(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  const usedPct =
    status?.storage_used_bytes && status.storage_quota_bytes
      ? Math.min(
          100,
          Math.round(
            (status.storage_used_bytes / status.storage_quota_bytes) * 100,
          ),
        )
      : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Cloud className="size-4 text-muted-foreground" />
            Dropbox Document Storage
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { loadStatus(); toast.info("Refreshing Dropbox status…"); }}
            disabled={loading}
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            <span className="ml-2">Refresh</span>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        )}

        {!loading && error && (
          <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <XCircle className="size-5 text-red-700 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-white">Error</p>
              <p className="text-xs text-white/90 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {!loading && !error && status && (
          <>
            {/* Connection status */}
            <div className="flex items-center gap-3">
              {status.connected ? (
                <CheckCircle2 className="size-5 text-green-600 shrink-0" />
              ) : (
                <XCircle className="size-5 text-destructive shrink-0" />
              )}
              <div>
                <p className="text-sm font-medium text-foreground">
                  {status.connected ? "Connected" : "Not Connected"}
                </p>
                {!status.connected && status.message && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {status.message}
                  </p>
                )}
              </div>
              <Badge
                className={
                  status.connected
                    ? "bg-green-50 text-green-700 border-green-200 ml-auto"
                    : "bg-red-50 text-red-700 border-red-200 ml-auto"
                }
                variant="outline"
              >
                {status.connected ? "Active" : "Disconnected"}
              </Badge>
            </div>

            {/* Storage widget */}
            {status.connected && (
              <div className="rounded-md border border-border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <HardDrive className="size-4 text-muted-foreground shrink-0" />
                  <p className="text-sm font-medium text-foreground">
                    Storage Usage
                  </p>
                </div>

                {usedPct !== null ? (
                  <>
                    <Progress value={usedPct} className="h-2" />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        Used:{" "}
                        <span className="font-medium text-foreground">
                          {formatGB(status.storage_used_bytes)}
                        </span>
                      </span>
                      <span>
                        Quota:{" "}
                        <span className="font-medium text-foreground">
                          {formatGB(status.storage_quota_bytes)}
                        </span>
                      </span>
                      <span>
                        <span
                          className={`font-medium ${usedPct >= 90 ? "text-destructive" : usedPct >= 75 ? "text-amber-600" : "text-foreground"}`}
                        >
                          {usedPct}%
                        </span>{" "}
                        used
                      </span>
                    </div>
                    {usedPct >= 90 && (
                      <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2">
                        <AlertTriangle className="size-4 text-red-700 shrink-0" />
                        <p className="text-xs text-white font-medium">
                          Storage is nearly full. Consider upgrading your
                          Dropbox plan.
                        </p>
                      </div>
                    )}
                    {usedPct >= 75 && usedPct < 90 && (
                      <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-2">
                        <AlertTriangle className="size-4 text-amber-600 shrink-0" />
                        <p className="text-xs text-amber-700">
                          Storage is above 75% capacity.
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Storage quota data unavailable.
                  </p>
                )}
              </div>
            )}

            {/* Connection check: create a test folder and show Dropbox's answer */}
            {status.connected && (
              <div className="rounded-md border border-border p-4 space-y-2">
                <p className="text-sm font-medium text-foreground">Check folder creation</p>
                <p className="text-xs text-muted-foreground">
                  Creates a folder called CMA-PMS-test in the connected Dropbox. Look for it in Dropbox afterwards. It is safe to delete.
                </p>
                <Button size="sm" variant="outline" disabled={testing} onClick={runFolderTest}>
                  {testing ? "Asking Dropbox…" : "Create test folder"}
                </Button>
                {testResult && (
                  <p className={`text-xs whitespace-pre-wrap break-words ${testResult.ok ? "text-green-700" : "text-destructive"}`}>
                    {testResult.text}
                  </p>
                )}
              </div>
            )}

            {/* Not connected — configuration guidance */}
            {!status.connected && (
              <div className="rounded-md border border-border p-4 space-y-2">
                <p className="text-sm font-medium text-foreground">Run diagnosis</p>
                <p className="text-xs text-muted-foreground">
                  Shows what Dropbox answers to the app, with no secrets. Send this text to whoever is helping you.
                </p>
                <Button size="sm" variant="outline" disabled={diagBusy} onClick={runDiagnosis}>
                  {diagBusy ? "Checking…" : "Run diagnosis"}
                </Button>
                {diagText && (
                  <pre className="text-xs whitespace-pre-wrap break-words rounded bg-muted p-2 text-foreground">{diagText}</pre>
                )}
              </div>
            )}
            {!status.connected && (
              <div className="rounded-md border border-border bg-muted/20 p-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Dropbox is not yet connected. Connect it to enable document
                  upload, download, and versioning for all clients, employees,
                  and engagements.
                </p>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground text-sm">
                    To connect:
                  </p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>
                      Open{" "}
                      <span className="font-medium text-foreground">
                        Workbench → Configure → Integrations
                      </span>
                    </li>
                    <li>
                      Find <span className="font-medium">Dropbox</span> and
                      click <span className="font-medium">Connect</span>
                    </li>
                    <li>Complete the OAuth flow in the popup</li>
                    <li>Return here and click Refresh</li>
                  </ol>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={() =>
                    toast.info(
                      "Open Workbench → Configure → Integrations to connect Dropbox.",
                    )
                  }
                >
                  <ExternalLink className="size-4" />
                  View Setup Instructions
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
