"use client";

/**
 * Platform-provided form wrapper — do NOT edit unless you want to customize
 * submit behavior. Wraps a designed <form> (its inputs/labels/styling are the
 * children) and turns it live: on submit it collects the named fields, POSTs
 * (create) or PATCHes (update) to /api/<entity>, toasts, then refreshes.
 *
 * The Remix emitter injects `name="<column>"` onto each bound control, so the
 * form's designed markup is preserved exactly; only submission is added.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export interface DataFormField {
  column: string;
}

export function DataForm(props: {
  entity: string;
  op?: "create" | "update";
  id?: string;
  fields: DataFormField[];
  fixed?: Record<string, unknown>;
  successToast?: string;
  onSuccess?: "refresh" | "reset" | { redirect: string };
  className?: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    const formEl = e.currentTarget;
    setSubmitting(true);
    const fd = new FormData(formEl);
    const body: Record<string, unknown> = { ...(props.fixed ?? {}) };
    for (const f of props.fields) {
      const v = fd.get(f.column);
      if (v !== null) body[f.column] = v;
    }
    try {
      const url =
        props.op === "update" && props.id
          ? `/api/${props.entity}/${props.id}`
          : `/api/${props.entity}`;
      const res = await fetch(url, {
        method: props.op === "update" ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Request failed");
      }
      toast.success(props.successToast ?? "Saved");
      const os = props.onSuccess ?? "refresh";
      if (os === "refresh") router.refresh();
      else if (os === "reset") formEl.reset();
      else if (typeof os === "object") router.push(os.redirect);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className={props.className} data-submitting={submitting}>
      {props.children}
    </form>
  );
}
