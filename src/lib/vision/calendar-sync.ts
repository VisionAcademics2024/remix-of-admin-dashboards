/**
 * Stage 3A client-side rule: a Google Calendar failure is not a scheduling
 * failure.
 *
 * The timetable is the source of truth. Once the reschedule has been saved, the
 * Google update is a follow-on: it is attempted only for a lesson already linked
 * to the sync test calendar, and its failure is reported as a warning to retry
 * rather than thrown - so nothing rolls back, undoes or recreates the lesson.
 */
import { isMappedSession, type SessionMapping } from "./gcal";

export type SyncAttempt = {
  attempted: boolean;
  ok: boolean;
  message?: string;
};

export async function syncAfterReschedule(
  mapping: SessionMapping | null | undefined,
  sync: (sessionId: string) => Promise<unknown>,
  sessionId: string,
): Promise<SyncAttempt> {
  if (!isMappedSession(mapping)) return { attempted: false, ok: true };
  try {
    await sync(sessionId);
    return { attempted: true, ok: true };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "The lesson moved, but Google Calendar needs a retry.",
    };
  }
}

/* ------------------------------------------------- the dialog's sync display */

export type SyncStatus = "not_synced" | "pending" | "synced" | "failed";

/**
 * What the lesson dialog shows. Held locally so a retry reflects its own result
 * immediately, instead of the Session prop that was read before the retry ran -
 * which is how a successful retry could still read "Failed".
 */
export type SyncView = { status: SyncStatus; lastSyncedAt: string | null };

const STATUSES: SyncStatus[] = ["not_synced", "pending", "synced", "failed"];

export function syncViewFromSession(
  status: string | null | undefined,
  lastSyncedAt: string | null | undefined,
): SyncView {
  return {
    status: STATUSES.includes(status as SyncStatus) ? (status as SyncStatus) : "not_synced",
    lastSyncedAt: lastSyncedAt ?? null,
  };
}

export type SyncEvent =
  | { type: "start" }
  | { type: "success"; at: string }
  | { type: "failure" };

/** Pending while it runs; Synced with a fresh timestamp on success; Failed on error. */
export function nextSyncView(state: SyncView, event: SyncEvent): SyncView {
  switch (event.type) {
    case "start":
      return { ...state, status: "pending" };
    case "success":
      return { status: "synced", lastSyncedAt: event.at };
    case "failure":
      return { ...state, status: "failed" };
  }
}

export function syncTone(status: SyncStatus): "success" | "danger" | "warning" {
  if (status === "synced") return "success";
  if (status === "failed") return "danger";
  return "warning";
}
