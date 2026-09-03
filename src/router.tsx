import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Without this every query is stale the moment it arrives, so moving
        // between two screens refetches both from scratch and the app feels
        // like it is loading constantly. Half a minute is short enough that a
        // roll marked on one screen is current on the next, and long enough
        // that stepping back and forth is instant.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        // A refetch on every window focus costs a full round trip for data that
        // is almost always unchanged - and on a tab left open all day, it fires
        // every time you glance at it.
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Hovering a nav link warms its data. Zero meant the warm-up was thrown
    // away before the click landed, so it paid the cost twice and saved
    // nothing.
    defaultPreloadStaleTime: 30_000,
  });

  return router;
};
