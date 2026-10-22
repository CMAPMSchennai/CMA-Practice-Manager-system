"use client";

import { useEffect, useState } from "react";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusChip, STATUS_TONE_INFO, type StatusTone } from "@/components/ui/status-chip";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const TONES: StatusTone[] = ["ok", "calm", "warn", "urgent", "over", "neutral"];

const STEPS: { title: string; text: string }[] = [
  { title: "Find your way", text: "The menu on the left has six groups. Open a group to see its pages, each with a short line saying what it is for." },
  { title: "Start each day on the Dashboard", text: "The top of the Dashboard says what needs you first. The warm yellow button is the one thing to do next." },
  { title: "Watch the deadline colours", text: "Green means plenty of time. Blue, amber and coral mean it is getting close. Red means it is already late." },
  { title: "Work from the left", text: "In the urgency boxes, tasks in the left box need you first." },
];

const WORDS: { word: string; meaning: string }[] = [
  { word: "Engagement", meaning: "A job we do for a client, like a GST return or an audit." },
  { word: "Period", meaning: "The months a job covers, for example April to June." },
  { word: "Reviewer", meaning: "The person who checks the work before it moves on." },
  { word: "Doer", meaning: "The person who does the work." },
  { word: "Partner in charge", meaning: "The partner responsible for a client or a job." },
  { word: "Realisation", meaning: "Of every ₹100 billed, how much the client has paid." },
  { word: "Receivable", meaning: "Money a client still owes the firm." },
  { word: "Acknowledgement", meaning: "The proof the government portal gives after a filing." },
  { word: "Escalation", meaning: "A reminder that gets stronger as a due date comes closer or passes." },
  { word: "Salary readiness", meaning: "Whether a person's tasks are far enough along for their salary to be released." },
  { word: "Library", meaning: "A standard list of steps for one kind of job." },
];

/** The "?" button in the top bar: a short quick start and a list of the firm's words explained. */
export function HelpDrawer() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("cma:open-help", onOpen);
    return () => window.removeEventListener("cma:open-help", onOpen);
  }, []);

  const needle = q.trim().toLowerCase();
  const words = WORDS.filter((w) => !needle || `${w.word} ${w.meaning}`.toLowerCase().includes(needle));

  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Help and words explained" title="Help and words explained">
        <CircleHelp className="size-5" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Help</SheetTitle>
            <SheetDescription>A quick start and the firm's words in plain language.</SheetDescription>
          </SheetHeader>

          <h3 className="mt-6 text-sm font-semibold text-foreground">Quick start in four steps</h3>
          <ol className="mt-2 space-y-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground">{i + 1}</span>
                <span>
                  <span className="block text-sm font-medium text-foreground">{s.title}</span>
                  <span className="block text-sm text-muted-foreground">{s.text}</span>
                </span>
              </li>
            ))}
          </ol>

          <h3 className="mt-8 text-sm font-semibold text-foreground">Colour key</h3>
          <p className="mt-1 text-sm text-muted-foreground">The same colours mean the same thing on every screen. Each also has an icon and a word.</p>
          <ul className="mt-2 space-y-2">
            {TONES.map((t) => (
              <li key={t} className="flex items-start gap-3">
                <span className="w-44 shrink-0">
                  <StatusChip tone={t}>{STATUS_TONE_INFO[t].name}</StatusChip>
                </span>
                <span className="text-sm text-muted-foreground">{STATUS_TONE_INFO[t].meaning}</span>
              </li>
            ))}
          </ul>

          <h3 className="mt-8 text-sm font-semibold text-foreground">Words explained</h3>
          <Input className="mt-2" placeholder="Type a word, for example realisation" aria-label="Search words" value={q} onChange={(e) => setQ(e.target.value)} />
          <dl className="mt-3 space-y-3">
            {words.map((w) => (
              <div key={w.word}>
                <dt className="text-sm font-medium text-foreground">{w.word}</dt>
                <dd className="text-sm text-muted-foreground">{w.meaning}</dd>
              </div>
            ))}
            {words.length === 0 && <p className="text-sm text-muted-foreground">No match. Try another word.</p>}
          </dl>
        </SheetContent>
      </Sheet>
    </>
  );
}
