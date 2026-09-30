"use client";

import { Check, Copy, Download, Share2 } from "lucide-react";
import { useMemo, useState } from "react";
import { canvasToBlob, cardCaption, drawWeekCard, type CardFormat } from "@/lib/share-card";
import type { WeekStats } from "@/lib/types";
import { Button, Field, Input, Modal, Segmented, Textarea } from "./ui";

const SIGNATURE_KEY = "share-card-signature";

function readSignature(): string {
  try {
    return localStorage.getItem(SIGNATURE_KEY) ?? "";
  } catch {
    return "";
  }
}

function render(stats: WeekStats, format: CardFormat, signature: string) {
  const canvas = document.createElement("canvas");
  drawWeekCard(canvas, stats, { format, signature });
  return canvas;
}

export function ShareCardButton({ stats }: { stats: WeekStats }) {
  const [open, setOpen] = useState(false);
  if (stats.score === null) return null;
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Share2 size={14} /> Картка для соцмереж
      </Button>
      {open && <ShareCardDialog stats={stats} onClose={() => setOpen(false)} />}
    </>
  );
}

function ShareCardDialog({ stats, onClose }: { stats: WeekStats; onClose: () => void }) {
  const [format, setFormat] = useState<CardFormat>("story");
  const [signature, setSignature] = useState(readSignature);
  const [caption, setCaption] = useState(() => cardCaption(stats));
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const preview = useMemo(() => render(stats, format, signature).toDataURL("image/png"), [stats, format, signature]);
  const fileName = `tyzhden-${stats.weekNumber}-${format}.png`;

  const saveSignature = (v: string) => {
    setSignature(v);
    try {
      localStorage.setItem(SIGNATURE_KEY, v);
    } catch {
      // ignore
    }
  };

  const download = async () => {
    const blob = await canvasToBlob(render(stats, format, signature));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setStatus("Картинку збережено.");
  };

  const share = async () => {
    try {
      const blob = await canvasToBlob(render(stats, format, signature));
      const file = new File([blob], fileName, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: caption });
        return;
      }
      await download();
      setStatus("Цей браузер не вміє ділитися файлами — картинку збережено, додай її в Stories вручну.");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return; // user closed the share sheet
      setStatus(e instanceof Error ? e.message : String(e));
    }
  };

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setStatus("Не вдалося скопіювати — виділи текст і скопіюй вручну.");
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Картка тижня"
      footer={
        <>
          <Button variant="ghost" onClick={download}>
            <Download size={15} /> Завантажити
          </Button>
          <Button variant="primary" onClick={share}>
            <Share2 size={15} /> Поділитися
          </Button>
        </>
      }
    >
      <div className="flex items-center justify-between gap-3">
        <Segmented
          value={format}
          onChange={setFormat}
          options={[
            { value: "story", label: "Stories 9:16" },
            { value: "post", label: "Пост 4:5" },
          ]}
        />
        <span className="text-[11px] text-faint">1080 px</span>
      </div>
      <div className="flex justify-center rounded-2xl border border-line bg-bg p-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
        <img
          src={preview}
          alt={`Картка тижня ${stats.weekNumber}: ${stats.score}/100`}
          className={format === "story" ? "max-h-[46dvh] w-auto rounded-xl" : "max-h-[40dvh] w-auto rounded-xl"}
        />
      </div>
      <Field label="Підпис на картці (необовʼязково)" hint="Наприклад, твій нік: @nikita. Запамʼятається для наступних тижнів.">
        <Input value={signature} maxLength={32} onChange={(e) => saveSignature(e.target.value)} placeholder="@нік" />
      </Field>
      <Field label="Текст до посту">
        <Textarea rows={6} value={caption} onChange={(e) => setCaption(e.target.value)} />
      </Field>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-faint">На картці лише цифри — без нотаток і описів.</p>
        <Button size="sm" variant="ghost" onClick={copyCaption}>
          {copied ? <Check size={14} className="text-good" /> : <Copy size={14} />} {copied ? "Скопійовано" : "Скопіювати текст"}
        </Button>
      </div>
      {status && <p role="status" className="text-xs text-muted">{status}</p>}
    </Modal>
  );
}
