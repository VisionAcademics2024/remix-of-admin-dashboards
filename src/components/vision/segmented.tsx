import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * A filter bar whose selection slides.
 *
 * Radix Tabs styles the active trigger directly, so moving between filters
 * reads as one pill blinking out and another blinking in. Here a single
 * indicator is measured against the buttons and translated, so the selection
 * travels — which is the difference between a page that changed and a page
 * that moved.
 *
 * Measured rather than calculated, because the labels are different widths and
 * the bar wraps on narrow screens.
 */
export function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  className,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: Array<{ value: T; label: string; count?: number | undefined }>;
  className?: string;
}) {
  const list = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; top: number; width: number; height: number }>();

  const index = options.findIndex((o) => o.value === value);

  useLayoutEffect(() => {
    const container = list.current;
    if (!container) return;

    const measure = () => {
      const active = container.querySelector<HTMLElement>(`[data-value="${CSS.escape(value)}"]`);
      if (!active) return;
      setPill({
        left: active.offsetLeft,
        top: active.offsetTop,
        width: active.offsetWidth,
        height: active.offsetHeight,
      });
    };

    measure();
    // Fonts landing late and the bar re-wrapping both move the target.
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [value, options.length]);

  // The pill should appear in place on first paint, not fly in from the corner.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (pill && !ready) setReady(true);
  }, [pill, ready]);

  return (
    <div
      ref={list}
      role="tablist"
      className={cn(
        "relative inline-flex flex-wrap items-center gap-0.5 rounded-full border border-[var(--edge)] bg-[var(--mat-regular)] p-1 shadow-[inset_0_1px_0_0_var(--edge-top)] backdrop-blur-2xl",
        className,
      )}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        const next = (index + (e.key === "ArrowRight" ? 1 : -1) + options.length) % options.length;
        onValueChange(options[next]!.value);
      }}
    >
      {pill && (
        <span
          aria-hidden
          className={cn(
            "absolute rounded-full bg-[var(--mat-thick)] shadow-[inset_0_1px_0_0_var(--edge-top),0_6px_16px_-10px_var(--shadow-key)]",
            ready && "transition-[transform,width,height] duration-[320ms]",
          )}
          style={{
            transform: `translate3d(${pill.left}px, ${pill.top}px, 0)`,
            width: pill.width,
            height: pill.height,
            transitionTimingFunction: "var(--ease-spatial)",
            left: 0,
            top: 0,
          }}
        />
      )}

      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            data-value={option.value}
            onClick={() => onValueChange(option.value)}
            className={cn(
              "relative z-10 whitespace-nowrap rounded-full px-3.5 py-1 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
            {option.count !== undefined && option.count > 0 && (
              <span className="ml-1.5 rounded-full bg-[var(--mat-thin)] px-1.5 text-[0.7rem] tabular-nums">
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
