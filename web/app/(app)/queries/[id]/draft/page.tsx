// Draft score tab (placeholder): replaced by the tab builder.
import { Card } from "@/components/ui/card";
import { SparklesIcon } from "@/components/ui/icons";

export default function DraftScoreTab() {
  return (
    <Card padding="lg" className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-faint text-brand">
        <SparklesIcon />
      </span>
      <div>
        <p className="font-semibold text-ink">This tab is being built</p>
        <p className="mt-1 text-sm leading-6 text-ink-muted">Paste a draft or a URL to score it against the brief and the cited pages.</p>
      </div>
    </Card>
  );
}
