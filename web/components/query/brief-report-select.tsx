"use client";
// Report selector for the Brief tab: switches between preliminary, full and refresh reports with ?report=<id>.
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { Label, Select } from "@/components/ui/form";
import { LoaderIcon } from "@/components/ui/icons";

export interface BriefReportOption {
  id: string;
  label: string;
}

export function BriefReportSelect({ options, value }: { options: BriefReportOption[]; value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function onChange(id: string) {
    startTransition(() => router.push(`${pathname}?report=${encodeURIComponent(id)}`, { scroll: false }));
  }

  return (
    <div className="flex w-full items-center gap-2 sm:w-auto">
      <Label htmlFor="brief-report" className="shrink-0 text-ink-muted">
        Report
      </Label>
      <Select
        id="brief-report"
        key={value}
        defaultValue={value}
        onChange={(e) => onChange(e.target.value)}
        options={options.map((o) => ({ value: o.id, label: o.label }))}
        wrapperClassName="min-w-0 flex-1 sm:w-80 sm:flex-none"
        disabled={pending}
      />
      {pending && <LoaderIcon className="shrink-0 animate-spin text-ink-soft" aria-label="Loading report" />}
    </div>
  );
}
