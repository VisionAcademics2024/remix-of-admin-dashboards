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
