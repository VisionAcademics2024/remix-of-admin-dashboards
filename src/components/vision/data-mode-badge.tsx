import { Database, FlaskConical } from "lucide-react";

import { dataMode } from "@/data";
import { cn } from "@/lib/utils";

/**
 * Says out loud which data the screen is showing. Mock mode must never be
 * mistaken for the real business.
 *
 * Named for the DATA environment, not the visual one — see
 * components/vision/environment.tsx for the scene behind the glass.
 */
export function DataModeBadge({ className }: { className?: string }) {
  const isMock = dataMode === "mock";
  const Icon = isMock ? FlaskConical : Database;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.68rem] font-medium",
        isMock
          ? "border-warning/40 bg-warning/10 text-warning-foreground"
          : "border-[var(--edge)] bg-[var(--mat-thin)] text-muted-foreground",
        className,
      )}
      title={
        isMock
          ? "Sample data for testing. Nothing here is a real student, charge or payout."
          : "Live data from your backend."
      }
    >
      <Icon className="h-3 w-3" aria-hidden />
      {isMock ? "Sample data" : "Live data"}
    </span>
  );
}
