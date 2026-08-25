import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-[0.82rem] font-medium",
    "cursor-pointer select-none focus-spatial press",
    "transition-[transform,box-shadow,background-color,color,border-color] duration-[var(--dur-base)] [transition-timing-function:var(--ease-spatial)]",
    "disabled:pointer-events-none disabled:opacity-40",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:stroke-[1.8]",
  ].join(" "),
  {
    variants: {
      variant: {
        /* The one saturated surface on screen. Everything else is material. */
        default:
          "bg-primary text-primary-foreground shadow-[inset_0_1px_0_0_oklch(1_0_0/28%),0_10px_28px_-14px_var(--color-primary)] hover:brightness-110",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[inset_0_1px_0_0_oklch(1_0_0/26%),0_10px_28px_-14px_var(--color-destructive)] hover:brightness-110",
        /* Glass. The default for anything that is not the primary action. */
        outline:
          "border border-[var(--edge)] bg-[var(--mat-regular)] backdrop-blur-2xl shadow-[inset_0_1px_0_0_var(--edge-top)] hover:bg-[var(--mat-thick)] hover:border-[var(--edge-strong)]",
        secondary:
          "border border-[var(--edge)] bg-[var(--mat-thick)] text-secondary-foreground backdrop-blur-2xl shadow-[inset_0_1px_0_0_var(--edge-top)] hover:brightness-110",
        ghost: "hover:bg-[var(--mat-regular)]",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9.5 px-4",
        sm: "h-8 px-3 text-[0.76rem]",
        lg: "h-11 px-7 text-[0.9rem]",
        icon: "h-9.5 w-9.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, onPointerDown, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    // A press should feel like a press. Beyond the held-down scale from the
    // `.press` class, every tap fires a quick squash-and-settle pop so the
    // click plainly registers - even on a fast tap, and even when the action
    // behind it takes a moment to come back. Driven by the Web Animations API
    // rather than a CSS class so a re-render (an optimistic update, say) mid-pop
    // can't cut it short, and skipped when the viewer prefers reduced motion.
    const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
      const el = event.currentTarget;
      if (
        typeof el.animate === "function" &&
        !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      ) {
        el.animate(
          [
            { transform: "scale(1)" },
            { transform: "scale(0.9)", offset: 0.35 },
            { transform: "scale(1.04)", offset: 0.7 },
            { transform: "scale(1)" },
          ],
          { duration: 260, easing: "cubic-bezier(0.32, 0.72, 0, 1)" },
        );
      }
      onPointerDown?.(event);
    };

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        onPointerDown={handlePointerDown}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
