import { queryOptions } from "@tanstack/react-query";

import { getMe } from "./session.functions";

/** Who am I, and may I be here? Shared by the access screen and the app shell. */
export const meQueryOptions = () =>
  queryOptions({ queryKey: ["me"], queryFn: () => getMe(), staleTime: 30_000 });
