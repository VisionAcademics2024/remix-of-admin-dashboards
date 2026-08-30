import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { db, requireStaff } from "./guard";
import {
  SYNC_CALENDAR_ID,
  isMappedSession,
  updateMappedSessionEvent,
  type SessionForSync,
  type SyncStore,
} from "./gcal";

/**
 * Stage 3A: keep the three already-linked lessons on the Google test calendar
 * in step with the dashboard timetable.
 *
 * Staff who can already move a lesson can update its linked event - the sync is
 * a consequence of rescheduling, not a separate privilege. The operation only
 * ever updates the stored event on the stored calendar: it never searches for
 * one and never creates one, so unlinked lessons cannot reach Google at all.
 */
export const syncSessionToGoogle = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) => z.object({ session_id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data: input }) => {
    const client = db(context.supabase);

    const { data: found, error: readError } = await client
      .from("sessions")
      .select(
        "id, code, starts_at, ends_at, room, status, google_calendar_id, google_event_id, tutors(full_name), class_offerings(code, room, programs(name))",
      )
      .eq("id", input.session_id)
      .maybeSingle();
    if (readError) throw readError;
    if (!found) throw new Error("That lesson no longer exists.");

    // The generated Database type still describes the prototype tables, so the
    // joined shape is narrowed here rather than inferred.
    const row = found as unknown as {
      id: string;
      code: string;
      starts_at: string;
      ends_at: string;
      room: string | null;
      status: string;
      google_calendar_id: string | null;
      google_event_id: string | null;
      tutors: { full_name: string } | null;
      class_offerings: {
        code: string;
        room: string | null;
        programs: { name: string } | null;
      } | null;
    };

    if (!row.google_calendar_id || !row.google_event_id) {
      throw new Error("This lesson is not linked to a Google Calendar event.");
    }
    if (!isMappedSession(row)) {
      throw new Error("This lesson is linked to a calendar this app may not write to.");
    }
    if (row.status !== "scheduled") {
      throw new Error("Only scheduled lessons can be sent to Google Calendar.");
    }
    if (new Date(row.starts_at).getTime() <= Date.now()) {
      throw new Error("Only future lessons can be sent to Google Calendar.");
    }

    const session: SessionForSync = {
      id: row.id,
      code: row.code,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      room: row.room ?? row.class_offerings?.room ?? null,
      tutor_name: row.tutors?.full_name ?? null,
      program_name: row.class_offerings?.programs?.name ?? null,
      offering_code: row.class_offerings?.code ?? null,
      google_event_id: row.google_event_id,
    };

    // Every status write is checked: a silent failure here would leave the
    // timetable and the calendar disagreeing with nothing to show for it.
    const setStatus = async (patch: Record<string, unknown>) => {
      const { error } = await client.from("sessions").update(patch).eq("id", row.id);
      if (error) throw error;
    };

    const store: SyncStore = {
      markPending: (id) => setStatus({ calendar_sync_status: "pending" }).then(() => void id),
      markSynced: async (_id, calendarId, eventId) => {
        await setStatus({
          google_calendar_id: calendarId,
          google_event_id: eventId,
          calendar_sync_status: "synced",
          calendar_last_synced_at: new Date().toISOString(),
        });
      },
      markFailed: async () => {
        // A failure to record the failure must not mask the original error, so
        // this one write is allowed to be best-effort.
        await client.from("sessions").update({ calendar_sync_status: "failed" }).eq("id", row.id);
      },
    };

    const { googleCalendarApi } = await import("./google-calendar.server");
    return updateMappedSessionEvent(session, googleCalendarApi, store, SYNC_CALENDAR_ID);
  });
