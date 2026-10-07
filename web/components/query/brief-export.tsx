"use client";
// Brief export: download the stored Markdown as <keyword>-brief-<date>.md, or copy it to the clipboard.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckIcon, CopyIcon, DownloadIcon } from "@/components/ui/icons";

export interface BriefExportProps {
  markdown: string;
  /** File name without extension, e.g. "best-form-builder-brief-2026-10-07". */
  fileName: string;
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Older browsers and non-secure contexts.
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  if (!ok) throw new Error("copy failed");
}

export function BriefExport({ markdown, fileName }: BriefExportProps) {
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (copy === "idle") return;
    const t = setTimeout(() => setCopy("idle"), 2_500);
    return () => clearTimeout(t);
  }, [copy]);

  function download() {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  async function onCopy() {
    try {
      await copyText(markdown);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" iconLeft={<DownloadIcon />} onClick={download}>
        Download .md
      </Button>
      <Button variant="secondary" iconLeft={copy === "copied" ? <CheckIcon className="text-good" /> : <CopyIcon />} onClick={() => void onCopy()}>
        {copy === "copied" ? "Copied" : "Copy Markdown"}
      </Button>
      <span role="status" aria-live="polite" className="text-xs text-ink-muted">
        {copy === "failed" ? "Copying was blocked by the browser. Use Download instead." : ""}
      </span>
    </div>
  );
}
