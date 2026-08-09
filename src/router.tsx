import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient, auth: { isAuthenticated: false, user: null, isLoading: true } },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
