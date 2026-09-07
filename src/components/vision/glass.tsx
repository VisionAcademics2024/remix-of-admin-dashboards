import { useCallback, useRef, type ElementType, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Pointer-tracked specular highlight.
 *
 * Real glass catches a light source, and the catch moves as your head does.
 * We can't track a head, so we track the pointer: --mx/--my feed the radial
 * gradient in `.glass--specular::before`.
 *
 * Written straight to the element's style rather than through React state -
 * this fires on every pointer move, and a re-render per frame would be a
 * needless cost for something purely visual.
 */
export function useSpecular<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  const onPointerMove = useCallback((event: React.PointerEvent<T>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${((event.clientX - rect.left) / rect.width) * 100}%`);
    el.style.setProperty("--my", `${((event.clientY - rect.top) / rect.height) * 100}%`);
  }, []);

  const onPointerLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.removeProperty("--mx");
    el.style.removeProperty("--my");
  }, []);

  return { ref, onPointerMove, onPointerLeave };
}

type Material = "thin" | "regular" | "thick" | "solid";

const MATERIAL_CLASS: Record<Material, string> = {
  thin: "glass--thin",
  regular: "",
  thick: "glass--thick",
  solid: "glass--solid",
};

export interface GlassProps {
  children: ReactNode;
  className?: string | undefined;
  /**
   * How much of the environment shows through.
   * `solid` is for anything carrying dense data - see the note in styles.css.
   */
  material?: Material | undefined;
  /** Lift toward the viewer on hover. Off for static containers. */
  interactive?: boolean | undefined;
  /** The pointer-tracked catch of light. On by default for interactive panels. */
  specular?: boolean | undefined;
  as?: ElementType | undefined;
  onClick?: (() => void) | undefined;
}

export function Glass({
  children,
  className,
  material = "regular",
  interactive = false,
  specular,
  as,
  onClick,
}: GlassProps) {
  const Component = (as ?? (onClick ? "button" : "div")) as ElementType;
  const wantsSpecular = specular ?? interactive;
  const { ref, onPointerMove, onPointerLeave } = useSpecular<HTMLElement>();

  return (
    <Component
      ref={wantsSpecular ? ref : undefined}
      onPointerMove={wantsSpecular ? onPointerMove : undefined}
      onPointerLeave={wantsSpecular ? onPointerLeave : undefined}
      onClick={onClick}
      className={cn(
        "glass",
        // A card is almost always a grid or flex item, and both give their
        // children `min-width: auto` - which means the column is sized by the
        // card's widest indivisible content rather than by the screen. One long
        // row inside a card therefore pushes the whole card past the viewport,
        // where `overflow-x: clip` on the document quietly amputates it: the
        // status pill, the right-hand figure and the last table column are
        // simply gone, with nothing to scroll to reach them. That is what was
        // happening on a phone. Letting a card shrink to its column is the fix,
        // and it belongs here rather than in every grid that holds one.
        "min-w-0",
        MATERIAL_CLASS[material],
        wantsSpecular && "glass--specular",
        interactive && "lift focus-spatial cursor-pointer",
        className,
      )}
    >
      {/* Content sits above ::before, which is the specular layer. */}
      <span className="relative block">{children}</span>
    </Component>
  );
}

/**
 * A screen. Wraps children in the entrance stagger so a page assembles from
 * back to front instead of snapping in.
 */
export function SpatialScreen({
  children,
  className,
}: {
  children: ReactNode;
  className?: string | undefined;
}) {
  return <div className={cn("stagger space-y-5", className)}>{children}</div>;
}
