import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-xl border border-[var(--edge)] bg-[var(--mat-thin)] px-3.5 text-base shadow-[inset_0_1px_0_0_var(--edge-top)] backdrop-blur-2xl transition-[background-color,border-color,box-shadow] duration-[var(--dur-fast)] [transition-timing-function:var(--ease-hover)] placeholder:text-muted-foreground focus-visible:border-[var(--edge-strong)] focus-visible:bg-[var(--mat-regular)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-40 md:text-sm py-1 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
