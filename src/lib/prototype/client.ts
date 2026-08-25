import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The generated Database type describes the current live tables, which no
 * longer include the renamed `proto_*` tables these legacy screens query.
 * Rather than delete working reference code, reach those tables through a
 * loosely-typed client - the same approach `src/lib/vision/guard.ts` uses.
 *
 * These screens are quarantined reference material: they are not linked from
 * the navigation, and the `proto_*` tables do not currently exist in the
 * database, so calling them will fail at runtime. Permanent removal is a
 * separately reviewed cleanup.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyClient = SupabaseClient<any, "public", any>;

export function db(client: unknown): AnyClient {
  return client as AnyClient;
}
