import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { TUTOR_COLOUR_FAMILIES } from "@/lib/vision/types";

/**
 * The tutor swatch grid.
 *
 * One column per hue, one row per depth, so the palette reads as a chart you
 * scan rather than a bag of colours you hunt through. It scrolls sideways on a
 * phone instead of reflowing - a wrapped grid would put "dark red" under "light
 * orange" and the whole point of the arrangement is lost.
 *
 * A tutor may also carry a colour that predates the palette, or one typed in by
 * hand, so anything not on the chart is shown as its own swatch at the end
 * rather than silently reading as "nothing selected".
 */
export function TutorColourPicker({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (colour: string) => void;
  id?: string | undefined;
}) {
  const known = TUTOR_COLOUR_FAMILIES.some((family) =>
    family.shades.some((shade) => shade.toLowerCase() === value?.toLowerCase()),
  );

  return (
    <div className="space-y-2">
      <div className="scroll-x -mx-1 px-1 pb-1">
        <div
          id={id}
          role="radiogroup"
          aria-label="Timetable colour"
          className="grid w-max grid-flow-col grid-rows-4 gap-1.5"
        >
          {TUTOR_COLOUR_FAMILIES.map((family) =>
            family.shades.map((shade, depth) => {
              const selected = shade.toLowerCase() === value?.toLowerCase();
              return (
                <button
                  key={shade}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`${family.name} ${depth + 1}`}
                  title={`${family.name} ${depth + 1}`}
                  onClick={() => onChange(shade)}
                  style={{ backgroundColor: shade }}
                  className={cn(
                    "focus-spatial flex h-8 w-8 items-center justify-center rounded-[7px] ring-inset transition-transform",
                    selected
                      ? "scale-110 ring-2 ring-foreground"
                      : "ring-1 ring-black/20 hover:scale-110",
                  )}
                >
                  {selected && (
                    <Check className="h-3.5 w-3.5 text-white drop-shadow" strokeWidth={3} />
                  )}
                </button>
              );
            }),
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* A native colour input for anything the chart does not cover - a
            school colour, or a shade a tutor asked for by name. */}
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            type="color"
            value={/^#[0-9a-f]{6}$/i.test(value ?? "") ? value : "#4f46e5"}
            onChange={(e) => onChange(e.target.value)}
            className="h-8 w-10 cursor-pointer rounded-[7px] border border-[var(--edge)] bg-transparent p-0.5"
            aria-label="Custom colour"
          />
          Custom
        </label>

        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className="inline-block h-4 w-4 rounded-[4px] ring-1 ring-inset ring-black/25"
            style={{ backgroundColor: value }}
            aria-hidden
          />
          <span className="code-chip">{value}</span>
          {!known && <span>(custom)</span>}
        </span>
      </div>
    </div>
  );
}
