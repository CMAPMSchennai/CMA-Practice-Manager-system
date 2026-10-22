"use client";

import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import {
  Upload,
  Download,
  FileText,
  AlertTriangle,
  Clock,
  CheckCircle2,
  History,
  RefreshCw,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { StatusChip } from "@/components/ui/status-chip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable } from "@/components/ui/data-table";
import { anotherFileName, nameKey, suggestedFileName } from "@/lib/document-naming";
import { DEFAULT_DOCUMENT_TYPES, DOCUMENT_CATEGORIES } from "@/lib/document-categories";

export interface DocumentRow extends Record<string, unknown> {
  id: string;
  file_name: string;
  document_type: string | null;
  file_ref: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  version: number;
  is_active: boolean;
  uploaded_by_name: string | null;
  expiry_date: string | null;
  created_at: string;
  owner_type: string;
  owner_id: string;
  pdf_category?: string;
  verified?: boolean;
  verified_by_name?: string | null;
  verified_at?: string | null;
  can_delete?: boolean;
  actions?: string[];
  checked?: boolean;
  checked_by_name?: string | null;
  checked_at?: string | null;
  peer_id?: string | null;
  peer_name?: string | null;
  peer_done_at?: string | null;
  manager_on_job?: boolean;
}

function formatBytes(bytes: number | null) {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isExpiringSoon(expiryDate: string | null) {
  if (!expiryDate) return false;
  const days = Math.floor(
    (new Date(expiryDate).getTime() - Date.now()) / 86400000,
  );
  return days >= 0 && days <= 30;
}

function isExpired(expiryDate: string | null) {
  if (!expiryDate) return false;
  return new Date(expiryDate).getTime() < Date.now();
}

// Used only until the editable list in Settings has loaded.
const FALLBACK_TYPES = DEFAULT_DOCUMENT_TYPES.map((t) => t.label);

// Matches MAX_UPLOAD_BYTES in lib/dropbox-files.ts (the server refuses anything larger).
const MAX_UPLOAD_MB = 10;

// ── Upload Dialog ──────────────────────────────────────────────────────────────
function UploadDialog({
  open,
  onOpenChange,
  ownerType,
  ownerId,
  engagementCode,
  existingNames = [],
  docTypes,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ownerType: string;
  ownerId: string;
  engagementCode?: string;
  existingNames?: string[];
  docTypes: string[];
  onUploaded: () => void;
}) {
  const [fileName, setFileName] = useState("");
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [docType, setDocType] = useState("");
  const [fileSizeBytes, setFileSizeBytes] = useState("");
  const [mimeType, setMimeType] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pickedName, setPickedName] = useState("");
  const [mode, setMode] = useState<"replace" | "another">("replace");

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      toast.error(`That file is larger than ${MAX_UPLOAD_MB} MB. Please choose a smaller file.`);
      e.target.value = "";
      return;
    }
    setPickedFile(file);
    setFileName(file.name);
    setPickedName(file.name);
    setMimeType(file.type);
    setFileSizeBytes(String(file.size));
  }

  // Job files are named by the system: <engagement code>_<document type>.<extension>.
  const baseKey = engagementCode && docType ? nameKey(suggestedFileName(engagementCode, docType, pickedName)) : "";
  const alreadyThere = !!baseKey && existingNames.some((n) => nameKey(n) === baseKey);
  const anotherName =
    engagementCode && docType && pickedName ? anotherFileName(engagementCode, docType, pickedName, existingNames) : "";
  const savedAs =
    engagementCode && docType && pickedName
      ? alreadyThere && mode === "another"
        ? anotherName
        : suggestedFileName(engagementCode, docType, pickedName)
      : null;
  const finalName = engagementCode ? (savedAs ?? "") : fileName;

  async function handleSubmit() {
    if (engagementCode && !docType) {
      toast.error("Choose the document type first.");
      return;
    }
    if (!pickedFile) {
      toast.error("Choose the file first.");
      return;
    }
    if (!finalName.trim()) {
      toast.error("File name is required.");
      return;
    }
    setSaving(true);
    try {
      // 1. Send the file itself to Dropbox. The server picks the folder.
      const form = new FormData();
      form.append("file", pickedFile);
      form.append("owner_type", ownerType);
      form.append("owner_id", ownerId);
      form.append("file_name", finalName);
      const up = await fetch("/api/documents/upload-file", { method: "POST", body: form });
      const upJson = await up.json().catch(() => ({}));
      if (!up.ok || !upJson.file_ref) {
        toast.error(upJson.error ?? "The file could not be saved to Dropbox.");
        return;
      }
      const finalRef: string = upJson.file_ref;

      // 2. Register the document with the Dropbox path that came back.
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner_type: ownerType,
          owner_id: ownerId,
          document_type: docType || null,
          file_name: finalName,
          file_ref: finalRef,
          original_file_name: pickedName || null,
          file_size_bytes: fileSizeBytes ? parseInt(fileSizeBytes, 10) : null,
          mime_type: mimeType || null,
          expiry_date: expiryDate || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Upload failed.");
        return;
      }
      toast.success(`${finalName} (v${json.version}) is saved in Dropbox at ${finalRef}`);
      setPickedName("");
      setPickedFile(null);
      setMode("replace");
      setFileName("");
      setDocType("");
      setFileSizeBytes("");
      setMimeType("");
      setExpiryDate("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      onOpenChange(false);
      onUploaded();
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message.trim()
          ? err.message
          : "Something went wrong.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
          <DialogDescription>
            Choose the file. It is saved in the firm&apos;s Dropbox, in the folder for this client and job, and
            recorded here. Files up to {MAX_UPLOAD_MB} MB.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {engagementCode && (
            <div className="rounded-md border border-border bg-muted/40 p-3 space-y-2">
              <div className="space-y-1.5">
                <Label htmlFor="doc-type-first">Document type *</Label>
                <Select value={docType} onValueChange={setDocType}>
                  <SelectTrigger id="doc-type-first">
                    <SelectValue placeholder="Select type…" />
                  </SelectTrigger>
                  <SelectContent>
                    {docTypes.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {savedAs ? (
                <p className="text-sm text-foreground">
                  This file will be saved as <span className="font-mono font-medium">{savedAs}</span>
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Choose the document type and the file. The system names it for you.
                </p>
              )}
              {alreadyThere && (
                <fieldset className="space-y-1.5 rounded-md border border-border bg-background p-2">
                  <legend className="px-1 text-xs font-medium text-foreground">A file of this type is already on this job</legend>
                  <label className="flex items-start gap-2 text-sm text-foreground">
                    <input type="radio" name="dup-mode" className="mt-1" checked={mode === "replace"} onChange={() => setMode("replace")} />
                    <span>Replace it. The new file becomes the next version.</span>
                  </label>
                  <label className="flex items-start gap-2 text-sm text-foreground">
                    <input type="radio" name="dup-mode" className="mt-1" checked={mode === "another"} onChange={() => setMode("another")} />
                    <span>
                      Add as another file. It is saved as <span className="font-mono">{anotherName || "…"}</span>.
                    </span>
                  </label>
                </fieldset>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="file-pick">Choose File (auto-fill)</Label>
            <Input
              id="file-pick"
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="cursor-pointer"
            />
          </div>

          <div className={engagementCode ? "hidden" : "space-y-1.5"}>
            <Label htmlFor="doc-file-name">File Name *</Label>
            <Input
              id="doc-file-name"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="e.g. pan_card.pdf"
            />
          </div>

          <div className={engagementCode ? "hidden" : "space-y-1.5"}>
            <Label htmlFor="doc-type">Document Type</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger id="doc-type">
                <SelectValue placeholder="Select type…" />
              </SelectTrigger>
              <SelectContent>
                {docTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="doc-expiry">Expiry Date</Label>
            <Input
              id="doc-expiry"
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Uploading…" : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Version History Dialog ─────────────────────────────────────────────────────
function VersionHistoryDialog({
  open,
  onOpenChange,
  ownerType,
  ownerId,
  fileName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ownerType: string;
  ownerId: string;
  fileName: string;
}) {
  const [versions, setVersions] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !fileName) return;
    setLoading(true);
    fetch(
      `/api/documents?owner_type=${ownerType}&owner_id=${ownerId}&active_only=false`,
    )
      .then((r) => r.json())
      .then((d) => {
        const all = Array.isArray(d?.documents) ? d.documents : [];
        setVersions(
          all
            .filter((doc: DocumentRow) => doc.file_name === fileName)
            .sort((a: DocumentRow, b: DocumentRow) => b.version - a.version),
        );
      })
      .catch(() => toast.error("Failed to load version history."))
      .finally(() => setLoading(false));
  }, [open, fileName, ownerType, ownerId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Version History</DialogTitle>
          <DialogDescription className="truncate">{fileName}</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="space-y-2 py-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : versions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No versions found.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {versions.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between py-3 gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Badge variant={v.is_active ? "default" : "secondary"}>
                    v{v.version}
                  </Badge>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {v.is_active ? "Current" : "Superseded"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(v.created_at).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}{" "}
                      · {v.uploaded_by_name ?? "Unknown"}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground truncate max-w-xs font-mono">
                  {v.file_ref}
                </p>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Verify tick ────────────────────────────────────────────────────────────────
// Grey tick: not verified. Click it and it turns green: verified.
// Point at a green tick and it turns red with a cross: click to remove the verification.
// People who may not verify see the status only. Colour is never the only signal:
// the icon and the word change too.
type VerifyAction = "check" | "uncheck" | "verify" | "unverify" | "request_peer" | "peer_review";

function shortDate(iso?: string | null) {
  return iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";
}

const MINI_BTN =
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-wait focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";

function VerifyControl({
  doc,
  busy,
  peers,
  onAction,
}: {
  doc: DocumentRow;
  busy: boolean;
  peers: { id: string; name: string }[];
  onAction: (doc: DocumentRow, action: VerifyAction, peerId?: string) => void;
}) {
  const [hot, setHot] = useState(false);
  const acts = (doc.actions ?? []) as VerifyAction[];
  const can = (a: VerifyAction) => acts.includes(a);
  const verified = !!doc.verified;
  const checked = !!doc.checked;

  const ok = { color: "hsl(var(--st-ok))", backgroundColor: "hsl(var(--st-ok-bg))", borderColor: "hsl(var(--st-ok) / 0.45)" };
  const outline = { color: "hsl(var(--st-ok))", backgroundColor: "transparent", borderColor: "hsl(var(--st-ok))" };

  let main: React.ReactNode;
  if (verified) {
    if (can("unverify")) {
      main = (
        <button
          type="button"
          disabled={busy}
          title="Verified. Click to remove the verification."
          aria-label="Verified. Click to remove the verification."
          onClick={() => { setHot(false); onAction(doc, "unverify"); }}
          onMouseEnter={() => setHot(true)}
          onMouseLeave={() => setHot(false)}
          onFocus={() => setHot(true)}
          onBlur={() => setHot(false)}
          className={MINI_BTN}
          style={hot ? { color: "#fff", backgroundColor: "hsl(var(--st-over-solid))", borderColor: "hsl(var(--st-over-solid))" } : ok}
        >
          {hot ? <XCircle className="size-3.5 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />}
          {hot ? "Unverify" : "Verified"}
        </button>
      );
    } else {
      main = <StatusChip tone="ok">Verified</StatusChip>;
    }
  } else if (checked) {
    main = (
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusChip tone="warn">Waiting for Managing Partner</StatusChip>
        {can("verify") && (
          <button type="button" disabled={busy} className={MINI_BTN} style={outline} onClick={() => onAction(doc, "verify")}>
            <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
            Verify
          </button>
        )}
      </div>
    );
  } else {
    main = (
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusChip tone="neutral">{doc.manager_on_job ? "Waiting for Manager" : "Not verified"}</StatusChip>
        {can("check") && (
          <button type="button" disabled={busy} className={MINI_BTN} style={outline} onClick={() => onAction(doc, "check")}>
            <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
            Check
          </button>
        )}
        {can("verify") && (
          <button type="button" disabled={busy} className={MINI_BTN} style={outline} onClick={() => onAction(doc, "verify")}>
            <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
            Verify
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {main}
      {checked && (
        <p className="text-xs text-muted-foreground">
          Checked by {doc.checked_by_name ?? "—"}
          {doc.checked_at ? `, ${shortDate(doc.checked_at)}` : ""}
        </p>
      )}
      {verified && (
        <p className="text-xs text-muted-foreground">
          Verified by {doc.verified_by_name ?? "—"}
          {doc.verified_at ? `, ${shortDate(doc.verified_at)}` : ""}
        </p>
      )}
      {doc.peer_name && (
        <p className="text-xs text-muted-foreground">
          Peer review: {doc.peer_name} {doc.peer_done_at ? `done ${shortDate(doc.peer_done_at)}` : "asked, waiting"}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {checked && !verified && can("uncheck") && (
          <button type="button" disabled={busy} className="text-xs text-muted-foreground underline cursor-pointer" onClick={() => onAction(doc, "uncheck")}>
            {can("verify") ? "Send back" : "Undo check"}
          </button>
        )}
        {can("peer_review") && (
          <button type="button" disabled={busy} className={MINI_BTN} style={outline} onClick={() => onAction(doc, "peer_review")}>
            <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
            Mark peer reviewed
          </button>
        )}
        {can("request_peer") && peers.length > 0 && (
          <select
            aria-label="Ask for a peer review"
            disabled={busy}
            defaultValue=""
            className="rounded-md border bg-background px-1.5 py-0.5 text-xs"
            onChange={(e) => {
              if (e.target.value) onAction(doc, "request_peer", e.target.value);
              e.target.value = "";
            }}
          >
            <option value="">Ask for a peer review…</option>
            {peers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

// ── Main DocumentVault Component ───────────────────────────────────────────────
export function DocumentVault({
  ownerType,
  ownerId,
  title = "Document Vault",
  engagementCode,
  onChanged,
}: {
  ownerType: "client" | "employee" | "engagement" | "entity";
  ownerId: string;
  title?: string;
  /** For engagement documents: files must be named <code>_<document type>. */
  engagementCode?: string;
  onChanged?: () => void;
}) {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [versionDoc, setVersionDoc] = useState<DocumentRow | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [peers, setPeers] = useState<{ id: string; name: string }[]>([]);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<DocumentRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [docTypes, setDocTypes] = useState<string[]>(FALLBACK_TYPES);
  const [catFilter, setCatFilter] = useState<string>("all");

  // The document types come from the list kept in Settings (the Managing Partner can change it).
  useEffect(() => {
    fetch("/api/document-types")
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d?.document_types) ? (d.document_types as { label: string; is_active: boolean }[]) : [];
        const names = list.filter((t) => t.is_active).map((t) => t.label);
        if (names.length > 0) setDocTypes(names);
      })
      .catch(() => {});
  }, []);

  function askDelete(doc: DocumentRow) {
    if (!doc.can_delete) {
      toast.error("You can delete only a file you uploaded that the Manager has not checked yet. Ask a Partner to delete this one.");
      return;
    }
    setDeleteDoc(doc);
  }

  async function confirmDelete() {
    if (!deleteDoc) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/documents/${deleteDoc.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "The file couldn't be deleted.");
        return;
      }
      toast.success("File deleted. A record of it is kept for the audit trail.");
      setDeleteDoc(null);
      loadDocuments();
      onChanged?.();
    } catch {
      toast.error("Something went wrong.");
    } finally {
      setDeleting(false);
    }
  }

  const DONE_TEXT: Record<VerifyAction, string> = {
    check: "Checked. The Managing Partner has been told.",
    uncheck: "Check removed.",
    verify: "Marked as verified.",
    unverify: "Verification removed.",
    request_peer: "Peer review asked.",
    peer_review: "Peer review marked as done.",
  };

  async function handleVerify(doc: DocumentRow, action: VerifyAction, peerId?: string) {
    setVerifyingId(doc.id);
    try {
      const res = await fetch(`/api/documents/${doc.id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, peer_id: peerId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "Could not update verification.");
        return;
      }
      toast.success(DONE_TEXT[action]);
      loadDocuments();
    } catch {
      toast.error("Something went wrong.");
    } finally {
      setVerifyingId(null);
    }
  }

  async function loadDocuments() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/documents?owner_type=${ownerType}&owner_id=${ownerId}`,
      );
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Failed to load documents.");
        setDocuments([]);
        return;
      }
      setDocuments(Array.isArray(json.documents) ? json.documents : []);
      setPeers(Array.isArray(json.peers) ? json.peers : []);
    } catch {
      toast.error("Failed to load documents.");
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (ownerId) loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerType, ownerId]);

  async function handleDownload(doc: DocumentRow) {
    setDownloading(doc.id);
    try {
      const res = await fetch(`/api/documents/${doc.id}/download`);
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Download failed.");
        return;
      }
      if (json.download_url) {
        window.open(json.download_url, "_blank");
        toast.success("Download link opened.");
      } else {
        toast.error(
          "Dropbox is not connected. Configure it under Settings → Integrations.",
        );
      }
    } catch {
      toast.error("Something went wrong.");
    } finally {
      setDownloading(null);
    }
  }

  // Expiry alerts
  const expiryAlerts = documents.filter(
    (d) => isExpired(d.expiry_date) || isExpiringSoon(d.expiry_date),
  );

  const columns: import("@/components/ui/data-table").DataTableColumnConfig<DocumentRow>[] = [
    {
      accessorKey: "file_name",
      header: "File Name",
      cell: ({ row }: { row: DocumentRow; value: unknown }) => {
        return (
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="size-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium truncate max-w-[200px]">
              {row.file_name}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "document_type",
      header: "Type",
      cell: ({ row }: { row: DocumentRow; value: unknown }) =>
        row.document_type ? (
          <Badge variant="outline" className="text-xs">
            {row.document_type}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        ),
    },
    {
      accessorKey: "pdf_category",
      header: "Category",
      cell: ({ row }: { row: DocumentRow; value: unknown }) => (
        <span className="text-xs text-foreground">{row.pdf_category ?? "Other"}</span>
      ),
    },
    {
      accessorKey: "version",
      header: "Ver.",
      cell: ({ row }: { row: DocumentRow; value: unknown }) => (
        <Badge variant="secondary" className="text-xs">
          v{row.version}
        </Badge>
      ),
    },
    {
      accessorKey: "file_size_bytes",
      header: "Size",
      cell: ({ row }: { row: DocumentRow; value: unknown }) => (
        <span className="text-xs text-muted-foreground">
          {formatBytes(row.file_size_bytes)}
        </span>
      ),
    },
    {
      accessorKey: "expiry_date",
      header: "Expiry",
      cell: ({ row }: { row: DocumentRow; value: unknown }) => {
        if (!row.expiry_date)
          return <span className="text-xs text-muted-foreground">—</span>;
        const expired = isExpired(row.expiry_date);
        const expiring = isExpiringSoon(row.expiry_date);
        return (
          <div className="flex items-center gap-1.5">
            {expired ? (
              <AlertTriangle className="size-3.5 text-destructive shrink-0" />
            ) : expiring ? (
              <Clock className="size-3.5 text-amber-500 shrink-0" />
            ) : (
              <CheckCircle2 className="size-3.5 text-green-600 shrink-0" />
            )}
            <span
              className={`text-xs ${expired ? "text-destructive font-medium" : expiring ? "text-amber-600" : "text-muted-foreground"}`}
            >
              {new Date(row.expiry_date).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "verified",
      header: "Status",
      cell: ({ row }: { row: DocumentRow; value: unknown }) => (
        <VerifyControl doc={row} busy={verifyingId === row.id} peers={peers} onAction={handleVerify} />
      ),
    },
    {
      accessorKey: "uploaded_by_name",
      header: "Uploaded By",
      cell: ({ row }: { row: DocumentRow; value: unknown }) => (
        <span className="text-xs text-muted-foreground">
          {row.uploaded_by_name ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "created_at",
      header: "Date",
      cell: ({ row }: { row: DocumentRow; value: unknown }) => (
        <span className="text-xs text-muted-foreground">
          {new Date(row.created_at).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </span>
      ),
    },
  ];

  const rowActions: import("@/components/ui/data-table").RowAction<DocumentRow>[] = [
    {
      id: "download",
      label: "Download",
      icon: <Download className="size-4" />,
      onClick: (row: DocumentRow) => handleDownload(row),
    },
    {
      id: "versions",
      label: "Version History",
      icon: <History className="size-4" />,
      onClick: (row: DocumentRow) => setVersionDoc(row),
    },
    {
      id: "delete",
      label: "Delete",
      icon: <Trash2 className="size-4" />,
      // Shown only where the person may delete: their own unverified file, or any file for a Partner or the Managing Partner.
      hidden: (row: DocumentRow) => !row.can_delete,
      onClick: (row: DocumentRow) => askDelete(row),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Expiry Alerts */}
      {expiryAlerts.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-600 shrink-0" />
            <p className="text-sm font-medium text-amber-800">
              Expiry Alerts ({expiryAlerts.length})
            </p>
          </div>
          {expiryAlerts.map((d) => (
            <p key={d.id} className="text-xs text-amber-700 ml-6">
              <span className="font-medium">{d.file_name}</span> —{" "}
              {isExpired(d.expiry_date) ? (
                <span className="text-destructive font-medium">EXPIRED</span>
              ) : (
                <>
                  expires{" "}
                  {new Date(d.expiry_date!).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </>
              )}
            </p>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="size-4 text-muted-foreground" />
              {title}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={loadDocuments}
                disabled={loading}
              >
                <RefreshCw
                  className={`size-4 ${loading ? "animate-spin" : ""}`}
                />
                <span className="sr-only">Refresh</span>
              </Button>
              <Button size="sm" onClick={() => setUploadOpen(true)}>
                <Upload className="size-4 mr-2" />
                Add Document
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-3/4" />
            </div>
          ) : documents.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <FileText className="size-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                No documents uploaded yet.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setUploadOpen(true)}
              >
                <Upload className="size-4 mr-2" />
                Add First Document
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Filter by category">
                {["all", ...DOCUMENT_CATEGORIES].map((c) => {
                  const n = c === "all" ? documents.length : documents.filter((d) => d.pdf_category === c).length;
                  if (c !== "all" && n === 0 && catFilter !== c) return null;
                  return (
                    <button
                      key={c}
                      type="button"
                      role="tab"
                      aria-selected={catFilter === c}
                      onClick={() => setCatFilter(c)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${catFilter === c ? "border-primary bg-primary text-primary-foreground" : "bg-card text-foreground hover:border-primary"}`}
                    >
                      {c === "all" ? "All" : c} ({n})
                    </button>
                  );
                })}
              </div>
              <DataTable<DocumentRow>
                columns={columns}
                data={catFilter === "all" ? documents : documents.filter((d) => d.pdf_category === catFilter)}
                globalSearch
                rowActions={rowActions}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        ownerType={ownerType}
        ownerId={ownerId}
        engagementCode={ownerType === "engagement" ? engagementCode : undefined}
        existingNames={documents.map((d) => d.file_name)}
        docTypes={docTypes}
        onUploaded={() => {
          loadDocuments();
          onChanged?.();
        }}
      />

      <Dialog open={!!deleteDoc} onOpenChange={(v) => { if (!v && !deleting) setDeleteDoc(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this file?</DialogTitle>
            <DialogDescription>
              {deleteDoc?.file_name} will be removed from this list and from the filing cabinet, with all its versions.
              A record of it is kept for the audit trail. To replace a file, upload the corrected one with the same name instead.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDoc(null)} disabled={deleting}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete file"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {versionDoc && (
        <VersionHistoryDialog
          open={!!versionDoc}
          onOpenChange={(v) => { if (!v) setVersionDoc(null); }}
          ownerType={ownerType}
          ownerId={ownerId}
          fileName={versionDoc.file_name}
        />
      )}

      {/* Invisible download-in-progress indicator */}
      {downloading && (
        <div className="fixed bottom-4 right-4 z-50 rounded-md border border-border bg-card px-4 py-2 shadow-md flex items-center gap-2">
          <RefreshCw className="size-4 animate-spin text-primary" />
          <span className="text-sm">Getting download link…</span>
          <button onClick={() => setDownloading(null)} className="ml-2">
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>
      )}
    </div>
  );
}
