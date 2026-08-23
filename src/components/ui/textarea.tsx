import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[84px] w-full rounded-xl border border-input bg-background/30 px-3.5 py-2.5 text-base shadow-[inset_0_1px_0_oklch(1_0_0/28%)] backdrop-blur-xl transition-[background-color,border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-primary/35 focus-visible:bg-background/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
