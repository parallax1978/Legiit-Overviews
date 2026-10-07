// ShareValue: a share as a big percentage with its sample size beside it, for StatCard values.
import { formatCount, formatPercent } from "@/lib/format";

export function ShareValue({ share, n, digits = 0 }: { share: number | null | undefined; n: number | null | undefined; digits?: number }) {
  return (
    <>
      {formatPercent(share, digits)}
      <span className="ml-1.5 align-middle text-xs font-medium tracking-normal text-ink-muted">n={formatCount(n)}</span>
    </>
  );
}
