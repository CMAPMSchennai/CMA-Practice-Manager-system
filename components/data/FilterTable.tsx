"use client";

/**
 * Client-side filterable list — the Remix emitter targets this for a container
 * carrying filter:{column}. It wraps the designed filter buttons + the (single)
 * server-rendered list. Buttons carry data-filter-btn="<value>"; list rows carry
 * data-filter-row="<row value>". Clicking a button shows only rows whose value
 * matches (data-filter-btn="*" or "all" shows everything). One list, one query —
 * no per-tab duplication.
 */
import * as React from "react";

export function FilterTable(props: { className?: string; children?: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = React.useState(0);

  React.useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const btns = Array.from(root.querySelectorAll<HTMLElement>("[data-filter-btn]"));
    const handlers = btns.map((b, i) => {
      const h = () => setActiveIdx(i);
      b.addEventListener("click", h);
      return [b, h] as const;
    });
    return () => handlers.forEach(([b, h]) => b.removeEventListener("click", h));
  }, []);

  React.useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const btns = Array.from(root.querySelectorAll<HTMLElement>("[data-filter-btn]"));
    const activeVal = btns[activeIdx]?.getAttribute("data-filter-btn") || "*";
    const showAll = activeVal === "*" || activeVal === "all" || activeVal === "";
    root.querySelectorAll<HTMLElement>("[data-filter-row]").forEach((row) => {
      const v = row.getAttribute("data-filter-row");
      row.style.display = showAll || v === activeVal ? "" : "none";
    });
    btns.forEach((b, i) => {
      const isActive = i === activeIdx;
      b.setAttribute("aria-pressed", String(isActive));
      b.classList.toggle("ring-2", isActive);
      b.classList.toggle("ring-primary", isActive);
    });
  }, [activeIdx]);

  return (
    <div ref={ref} className={props.className}>
      {props.children}
    </div>
  );
}
