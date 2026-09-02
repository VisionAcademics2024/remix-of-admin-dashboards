import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-[0.82rem] font-medium",
    "cursor-pointer select-none focus-spatial press",
    "transition-[transform,box-shadow,background-color,color,border-color] duration-[var(--dur-fast)] [transition-timing-function:var(--ease-hover)]",
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

    // A press should feel like a press.
    //
    // `.press:active` covers a held button, but a fast tap can be over before
    // :active has visibly resolved - so pointer-down also fires a short dip
    // through the Web Animations API, which survives a re-render mid-press (an
    // optimistic update, say) where a CSS class would be cut short. WAAPI also
    // means it runs on the compositor rather than the main thread.
    //
    // The values are deliberately small: 0.97 is the depth that reads as a
    // press without the label visibly shrinking, and there is no overshoot
    // past 1. A button bouncing bigger than itself is momentum the gesture
    // never had - overshoot belongs to things you throw, not things you click.
    const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
      const el = event.currentTarget;
      if (
        typeof el.animate === "function" &&
        !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      ) {
        el.animate(
          [
            { transform: "scale(1)" },
            { transform: "scale(0.97)", offset: 0.4 },
            { transform: "scale(1)" },
          ],
          { duration: 140, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
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
