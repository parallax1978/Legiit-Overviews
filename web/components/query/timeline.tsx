// CaptureTimeline: the last 7 UTC days as rows of eight 3-hour slots, each a square colored by what the
// capture in it found (overview shown, no overview, error), outlined when a slot has no capture.
import { cn } from "@/lib/cn";
import { formatDayUTC } from "@/lib/format";
import type { SnapshotStatus } from "@/lib/types";
import { Hint } from "./hint";
import { CAPTURE_STATUS_NAMES } from "./labels";

const HOUR = 3_600_000;
const DAY = 86_400_000;
const SLOT = 3 * HOUR;

type SlotState = SnapshotStatus | "missing" | "upcoming" | "before";

const SLOT_CLASSES: Record<SlotState, string> = {
  present: "bg-brand",
  absent: "bg-line-strong",
  error: "bg-bad",
  missing: "border border-ink-soft/70 bg-white",
  upcoming: "border border-dashed border-line-strong bg-transparent",
  before: "bg-surface-sunken",
};

const STATE_NAMES: Record<SlotState, string> = {
  ...CAPTURE_STATUS_NAMES,
  missing: "No capture",
  upcoming: "Not due yet",
  before: "Before tracking started",
};

const RANK: Record<SnapshotStatus, number> = { present: 0, absent: 1, error: 2 };

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function hhmm(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export interface CaptureTimelineProps {
  captures: { captured_at: string; status: SnapshotStatus }[];
  /** Server time in ms. */
  now: number;
  /** When tracking began (series creation or first capture); earlier slots are not counted as missing. */
  trackingStart: string | null;
  days?: number;
  className?: string;
}

export function CaptureTimeline({ captures, now, trackingStart, days = 7, className }: CaptureTimelineProps) {
  const today = Math.floor(now / DAY) * DAY;
  const start = trackingStart ? Date.parse(trackingStart) : Number.NaN;
  const bySlot = new Map<number, { t: number; status: SnapshotStatus }[]>();
  for (const c of captures) {
    const t = Date.parse(c.captured_at);
    if (Number.isNaN(t)) continue;
    const slot = Math.floor(t / SLOT) * SLOT;
    const list = bySlot.get(slot) ?? [];
    list.push({ t, status: c.status });
    bySlot.set(slot, list);
  }

  const rows = Array.from({ length: days }, (_, k) => today - k * DAY);
  const hours = Array.from({ length: 8 }, (_, s) => s * 3);

  return (
    <div className={className}>
      <div className="grid grid-cols-[3.25rem_repeat(8,minmax(0,1fr))] items-center gap-x-1.5 gap-y-1.5 sm:gap-x-2">
        <span />
        {hours.map((h) => (
          <span key={h} className="text-center text-[10px] font-medium tabular-nums text-ink-soft">
            {pad(h)}
          </span>
        ))}
        {rows.map((day) => (
          <TimelineRow key={day} day={day} now={now} start={start} bySlot={bySlot} />
        ))}
      </div>
      <p className="mt-2 text-right text-[11px] text-ink-soft">Hours in UTC, newest day first</p>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-muted">
        {(["present", "absent", "error", "missing", "upcoming"] as SlotState[]).map((s) => (
          <li key={s} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={cn("h-3 w-3 rounded-[3px]", SLOT_CLASSES[s])} />
            {STATE_NAMES[s]}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TimelineRow({
  day,
  now,
  start,
  bySlot,
}: {
  day: number;
  now: number;
  start: number;
  bySlot: Map<number, { t: number; status: SnapshotStatus }[]>;
}) {
  return (
    <>
      <span className="text-[11px] font-medium tabular-nums text-ink-muted">{formatDayUTC(day)}</span>
      {Array.from({ length: 8 }, (_, s) => {
        const slot = day + s * SLOT;
        const caps = (bySlot.get(slot) ?? []).sort((a, b) => RANK[a.status] - RANK[b.status] || a.t - b.t);
        let state: SlotState;
        if (caps.length) state = caps[0].status;
        else if (slot + SLOT > now) state = "upcoming";
        else if (!Number.isNaN(start) && slot + SLOT <= start) state = "before";
        else state = "missing";
        const range = `${formatDayUTC(slot)}, ${hhmm(slot)} to ${hhmm(slot + SLOT)} UTC`;
        const detail = caps.length
          ? caps.map((c) => `${CAPTURE_STATUS_NAMES[c.status]} at ${hhmm(c.t)}`).join(", ")
          : STATE_NAMES[state];
        return (
          <div key={s} className="flex justify-center">
            <Hint
              align={s < 4 ? "start" : "end"}
              content={
                <>
                  <span className="block font-semibold">{range}</span>
                  <span className="block text-white/80">{detail}</span>
                </>
              }
            >
              <span role="img" aria-label={`${range}: ${detail}`} className={cn("block h-6 w-6 rounded-[5px] sm:h-7 sm:w-7", SLOT_CLASSES[state])} />
            </Hint>
          </div>
        );
      })}
    </>
  );
}
