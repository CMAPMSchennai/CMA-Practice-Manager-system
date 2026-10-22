"use client";

/**
 * Platform-provided action button — do NOT edit unless customizing behavior.
 * Wraps a designed button's label/icon (children) and turns clicks into a
 * create/update/delete against /api/<entity>[/id], then toasts + refreshes.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function ActionButton(props: {
  entity: string;
  op: "create" | "update" | "delete";
  id?: string;
  values?: Record<string, unknown>;
  successToast?: string;
  onSuccess?: "refresh" | { redirect: string };
  className?: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function onClick() {
    if (busy) return;
    setBusy(true);
    try {
      const base = `/api/${props.entity}`;
      let url: string;
      let method: string;
      if (props.op === "create") {
        url = base;
        method = "POST";
      } else if (props.op === "delete") {
        url = `${base}/${props.id}`;
        method = "DELETE";
      } else {
        url = `${base}/${props.id}`;
        method = "PATCH";
      }
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: props.op === "delete" ? undefined : JSON.stringify(props.values ?? {}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Request failed");
      }
      toast.success(props.successToast ?? "Done");
      const os = props.onSuccess ?? "refresh";
      if (os === "refresh") router.refresh();
      else router.push(os.redirect);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" disabled={busy} onClick={onClick} className={props.className}>
      {props.children}
    </button>
  );
}
