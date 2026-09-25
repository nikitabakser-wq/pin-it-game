"use client";

import Link from "next/link";
import { Sparkles, Target } from "lucide-react";
import { useMemo, useState } from "react";
import { buildFocus, summarizeForAI } from "@/lib/focus";
import { useStore } from "@/lib/store";
import { today } from "@/lib/dates";
import { Button, Card, SectionTitle } from "./ui";

interface AIRec {
  title: string;
  reason: string;
  action: string;
}

export function FocusCard() {
  const { data } = useStore();
  const date = today();
  const rules = useMemo(() => buildFocus(data, date), [data, date]);
  const [ai, setAi] = useState<AIRec[] | null>(null);
  const [aiState, setAiState] = useState<"idle" | "loading" | "error">("idle");
  const [aiMsg, setAiMsg] = useState("");

  const askAI = async () => {
    setAiState("loading");
    setAiMsg("");
    try {
      const res = await fetch("/api/focus", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(summarizeForAI(data, date)),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      setAi(body.recommendations);
      setAiState("idle");
    } catch (e) {
      setAiState("error");
      setAiMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const items = ai ?? rules;

  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-accent/10 blur-3xl" aria-hidden />
      <SectionTitle
        action={
          <div className="flex items-center gap-2">
            {ai && (
              <button className="text-[11px] text-muted hover:text-fg" onClick={() => setAi(null)}>
                Show rule-based
              </button>
            )}
            <Button size="sm" variant="ghost" onClick={askAI} disabled={aiState === "loading"} title="Ask the AI coach (needs ANTHROPIC_API_KEY on the server)">
              <Sparkles size={14} /> {aiState === "loading" ? "Thinking…" : "AI coach"}
            </Button>
          </div>
        }
      >
        🎯 Today&apos;s focus {ai && <span className="ml-1 normal-case tracking-normal text-accent">· AI</span>}
      </SectionTitle>
      {aiState === "error" && <p className="mb-3 text-xs text-mid">{aiMsg} Showing rule-based focus.</p>}
      {items.length === 0 ? (
        <p className="text-sm text-muted">Nothing urgent. Pick one weekly goal and move it forward.</p>
      ) : (
        <ol className="space-y-3">
          {items.map((f, i) => {
            const href = "areaId" in f && f.areaId ? `/areas/${f.areaId}` : null;
            const body = (
              <div className="flex gap-3">
                <span className="tabular mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-xs font-semibold text-muted">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{f.title}</p>
                  <p className="mt-0.5 text-xs text-muted">{f.reason}</p>
                  <p className="mt-1.5 flex items-start gap-1.5 text-xs text-fg/90">
                    <Target size={13} className="mt-px shrink-0 text-accent" /> {f.action}
                  </p>
                </div>
              </div>
            );
            return (
              <li key={i} className="animate-fade-in" style={{ animationDelay: `${i * 60}ms` }}>
                {href ? <Link href={href} className="-m-2 block rounded-xl p-2 hover:bg-surface-2">{body}</Link> : body}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
