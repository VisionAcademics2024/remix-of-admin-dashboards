import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LogOut, Menu, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { getNeedsAttentionCount } from "@/lib/vision/overview.functions";
import type { StaffRole } from "@/lib/vision/types";
import { cn } from "@/lib/utils";
import { isActivePath, navGroupsFor } from "@/components/vision/nav-items";
import visionLogo from "@/assets/vision-logo.png.asset.json";

/**
 * Navigation for a phone.
 *
 * The desktop rail widens when a pointer rests on it. A touch screen has no
 * resting pointer, so on a phone that rail is replaced by this: one button in
 * the top-right corner that opens every section as a full-width button you tap.
 * It appears because you asked for it and closes when you have chosen - nothing
 * slides in and out under your thumb.
 *
 * The panel is a plain fixed overlay rather than a library sheet: it needs to
 * hang off the header button, carry the account row and sign-out, and stay in
 * the app's own material.
 */
/** Matches --dur-base, the exit both `.scrim` and `.materialize-surface` use. */
const EXIT_MS = 220;

export function MobileNav({ role, name }: { role: StaffRole; name: string }) {
  const [open, setOpen] = useState(false);
  // Kept mounted through the exit so the panel blurs back out the way a dialog
  // does. Without it the menu simply stopped existing mid-tap - the one motion
  // on a phone nobody could miss, since every other surface in the app
  // materialises in and dissolves out.
  const [closing, setClosing] = useState(false);
  const exitTimer = useRef<number | null>(null);
  const openRef = useRef(false);
  openRef.current = open;
  const navigate = useNavigate();
  const currentPath = useRouterState({ select: (r) => r.location.pathname });

  const { data: attention } = useQuery({
    queryKey: ["needs-attention-count"],
    queryFn: () => getNeedsAttentionCount(),
    refetchInterval: 120_000,
  });

  /**
   * Dismiss with the exit animation, then unmount.
   *
   * The delay matches --dur-base, which is what `.scrim` and
   * `.materialize-surface` use for their closed state. The timer is held so a
   * second tap during the exit cannot strand a panel mid-dissolve.
   */
  const close = useCallback(() => {
    setClosing(true);
    if (exitTimer.current) window.clearTimeout(exitTimer.current);
    exitTimer.current = window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
      exitTimer.current = null;
    }, EXIT_MS);
  }, []);

  // Navigating closes the menu, through the exit rather than by snapping it
  // out of existence. The page arriving underneath has its own entrance, and
  // the two overlapping for a fifth of a second is what makes changing tab
  // read as one movement instead of two events.
  useEffect(() => {
    if (openRef.current) close();
    // `close` is stable and the path is the trigger; depending on `open` would
    // re-run this the moment the exit finishes and start another one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath]);

  useEffect(() => {
    return () => {
      if (exitTimer.current) window.clearTimeout(exitTimer.current);
    };
  }, []);

  // Escape closes it, and the page behind it does not scroll while it is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, close]);

  const count = attention?.count ?? 0;

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        className="focus-spatial press relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--mat-thick)] shadow-[inset_0_1px_0_0_var(--edge-top)] lg:hidden"
      >
        {open ? (
          <X className="h-5 w-5" strokeWidth={1.9} />
        ) : (
          <Menu className="h-5 w-5" strokeWidth={1.9} />
        )}
        {/* Unattended items are worth knowing about before the menu is opened. */}
        {count > 0 && !open && (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-warning ring-2 ring-[var(--mat-thick)]" />
        )}
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          /*
           * Rendered onto <body>, not where it sits in the tree.
           *
           * This lives inside the header, and the header is `.glass` - which
           * means backdrop-filter, and an element with a backdrop-filter is a
           * containing block for its fixed-position descendants. So `fixed
           * inset-0` on the scrim resolved against the header's own box rather
           * than the viewport: it painted a grey panel across the top bar
           * instead of dimming the page, and it painted it inside the header's
           * stacking context, so it covered the very X that closes it. The
           * panel had the same problem the other way round - anchored to the
           * header rather than the screen, so opening the menu part-way down a
           * page put it somewhere you had to scroll back up to find.
           *
           * A portal takes both out of that containing block. The scrim dims
           * the whole page, the panel is genuinely fixed to the viewport and
           * stays where you are, and the header - z-50 against the scrim's
           * z-40 - stays lit with its X legible.
           */
          <>
            <button
              type="button"
              aria-hidden
              tabIndex={-1}
              onClick={close}
              data-state={closing ? "closed" : "open"}
              className="scrim fixed inset-0 z-40 cursor-default bg-black/50 backdrop-blur-[3px] lg:hidden"
            />

            <nav
              aria-label="Sections"
              // Hung off the header: it is sticky at 0.75rem and 3.5rem tall, so
              // its underside is 4.25rem down and the panel begins half a step
              // below that. The gap is deliberate - the two are separate
              // surfaces - and it only reads as one now the header sits above
              // the scrim rather than being dimmed by it.
              data-state={closing ? "closed" : "open"}
              className="ornament ornament--panel materialize-surface fixed inset-x-3.5 top-[4.75rem] z-50 max-h-[calc(100dvh-5.75rem)] overflow-y-auto overscroll-contain rounded-[1.75rem] p-3 lg:hidden"
            >
              <div className="mb-2 flex items-center gap-2.5 px-1.5 pb-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-white via-[#FBF7F0] to-[#EDE6DA] shadow-[inset_0_1px_0_0_var(--edge-top)]">
                  <img
                    src={visionLogo.url}
                    alt="Vision Academics"
                    className="h-6 w-6 object-contain"
                  />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[0.9rem] font-semibold leading-tight">
                    Vision CRM
                  </span>
                  <span className="block truncate text-[0.75rem] capitalize text-muted-foreground">
                    {name} · {role}
                  </span>
                </span>
              </div>

              {navGroupsFor(role).map((group) => (
                <div key={group.label} className="mb-1.5">
                  <p className="mb-1 px-2 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {group.label}
                  </p>
                  {/* Two across on anything wider than a small phone, so the whole
                    app is reachable without scrolling the panel. */}
                  <ul className="grid grid-cols-1 gap-1 min-[26rem]:grid-cols-2">
                    {group.items.map((item) => {
                      const active = isActivePath(item.url, currentPath);
                      const badge = item.badge ? count : 0;

                      return (
                        <li key={item.url}>
                          <Link
                            to={item.url}
                            data-active={active}
                            onClick={close}
                            className="ornament-item focus-spatial press flex min-h-12 items-center gap-3 px-3 py-2"
                          >
                            <item.icon
                              className={cn(
                                "h-5 w-5 shrink-0",
                                active ? "text-primary" : "text-foreground/70",
                              )}
                              strokeWidth={active ? 2.1 : 1.7}
                            />
                            <span
                              className={cn(
                                "min-w-0 flex-1 truncate text-[0.92rem]",
                                active ? "font-semibold text-foreground" : "text-foreground/85",
                              )}
                            >
                              {item.title}
                            </span>
                            {badge > 0 && (
                              <span className="shrink-0 rounded-full bg-warning px-1.5 text-[0.7rem] font-semibold tabular-nums text-warning-foreground">
                                {badge}
                              </span>
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}

              <button
                type="button"
                onClick={handleSignOut}
                className="ornament-item focus-spatial press mt-1 flex min-h-12 w-full items-center gap-3 px-3 py-2"
              >
                <LogOut className="h-5 w-5 shrink-0 text-foreground/70" strokeWidth={1.7} />
                <span className="text-[0.92rem] text-foreground/85">Sign out</span>
              </button>
            </nav>
          </>,
          document.body,
        )}
    </>
  );
}
