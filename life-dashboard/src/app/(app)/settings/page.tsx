"use client";

import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { buildScoreIndex, scoreDay } from "@/lib/score";
import { today } from "@/lib/dates";
import type { ScoreConfig } from "@/lib/types";
import { DEFAULT_SCORE_CONFIG } from "@/lib/types";
import { Button, Card, Field, Input, PageHeader, SectionTitle, Select } from "@/components/ui";

const WEIGHT_INFO: { key: keyof ScoreConfig["weights"]; label: string; help: string }[] = [
  { key: "planned", label: "Planned tasks done", help: "Completed ÷ planned tasks for the day" },
  { key: "important", label: "Important tasks done", help: "Completed ÷ planned high-priority tasks" },
  { key: "coverage", label: "Areas worked on", help: "Distinct areas with activity ÷ target" },
  { key: "consistency", label: "Consistency", help: "Share of previous days with any activity" },
];

export default function SettingsPage() {
  const { data, saveSettings, scoreConfig, user, signOut } = useStore();
  const [name, setName] = useState(data.settings?.display_name ?? "");
  const [wso, setWso] = useState(String(data.settings?.week_starts_on ?? 1));
  const [cfg, setCfg] = useState<ScoreConfig>({ ...DEFAULT_SCORE_CONFIG, ...scoreConfig, weights: { ...DEFAULT_SCORE_CONFIG.weights, ...scoreConfig.weights } });
  const [saved, setSaved] = useState<string | null>(null);

  const idx = useMemo(() => buildScoreIndex(data.goals, data.activities, data.dailyLogs), [data.goals, data.activities, data.dailyLogs]);
  const preview = scoreDay(today(), idx, cfg);
  const current = scoreDay(today(), idx, scoreConfig);

  const save = async (what: string, patch: Parameters<typeof saveSettings>[0]) => {
    await saveSettings(patch);
    setSaved(what);
    setTimeout(() => setSaved(null), 2000);
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), ...data }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `life-progress-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="animate-fade-in space-y-5">
      <PageHeader title="Settings" subtitle={user?.email} />

      <Card>
        <SectionTitle>Profile</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Display name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Week starts on">
            <Select value={wso} onChange={(e) => setWso(e.target.value)}>
              <option value="1">Monday</option>
              <option value="0">Sunday</option>
            </Select>
          </Field>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button variant="primary" onClick={() => save("profile", { display_name: name.trim() || null, week_starts_on: Number(wso) })}>Save profile</Button>
          {saved === "profile" && <span className="text-xs text-good">Saved</span>}
        </div>
      </Card>

      <Card>
        <SectionTitle>Daily score formula</SectionTitle>
        <p className="mb-4 text-sm text-muted">
          The score is built only from what you actually did. Each part is scored 0–100% and weighted.
          Parts with nothing to measure that day are skipped and the rest are rescaled, so a perfect day is always 100.
          A manual score on a day overrides the calculation.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {WEIGHT_INFO.map((w) => (
            <Field key={w.key} label={`${w.label} — weight`} hint={w.help}>
              <Input type="number" min={0} max={100} value={cfg.weights[w.key]} onChange={(e) => setCfg({ ...cfg, weights: { ...cfg.weights, [w.key]: Math.max(0, Number(e.target.value) || 0) } })} />
            </Field>
          ))}
          <Field label="Area coverage target" hint="How many different areas in one day count as full coverage">
            <Input type="number" min={1} max={10} value={cfg.coverageTarget} onChange={(e) => setCfg({ ...cfg, coverageTarget: Math.max(1, Number(e.target.value) || 1) })} />
          </Field>
          <Field label="Consistency window (days)" hint="How many previous days are checked">
            <Input type="number" min={0} max={14} value={cfg.consistencyDays} onChange={(e) => setCfg({ ...cfg, consistencyDays: Math.max(0, Number(e.target.value) || 0) })} />
          </Field>
        </div>
        <p className="mt-4 text-sm">
          Today with this formula: <span className="tabular font-semibold">{preview.computed ?? "—"}</span>
          <span className="text-muted"> (currently {current.computed ?? "—"})</span>
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={() => save("score", { score_config: cfg })}>Save formula</Button>
          <Button variant="ghost" onClick={() => setCfg(DEFAULT_SCORE_CONFIG)}>Reset to defaults</Button>
          {saved === "score" && <span className="text-xs text-good">Saved</span>}
        </div>
      </Card>

      <Card>
        <SectionTitle>Your data</SectionTitle>
        <p className="mb-4 text-sm text-muted">Everything is stored in your Supabase database. Download a full copy any time.</p>
        <div className="flex flex-wrap gap-3">
          <Button onClick={exportData}><Download size={15} /> Export JSON</Button>
          <Button variant="ghost" onClick={signOut}>Sign out</Button>
        </div>
      </Card>
    </div>
  );
}
