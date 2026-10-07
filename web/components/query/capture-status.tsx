// CaptureStatusChip: one capture's result as a chip (overview shown, no overview, capture failed).
import { Chip, type ChipProps, type ChipTone } from "@/components/ui";
import type { SnapshotStatus } from "@/lib/types";
import { CAPTURE_STATUS_NAMES } from "./labels";

const TONES: Record<SnapshotStatus, ChipTone> = { present: "brand", absent: "grey", error: "bad" };

export function CaptureStatusChip({ status, ...props }: Omit<ChipProps, "tone" | "dot" | "children"> & { status: SnapshotStatus }) {
  return (
    <Chip tone={TONES[status] ?? "grey"} dot {...props}>
      {CAPTURE_STATUS_NAMES[status] ?? status}
    </Chip>
  );
}
