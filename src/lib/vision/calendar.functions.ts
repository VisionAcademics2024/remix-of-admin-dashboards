import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { db, requireOwner } from "./guard";
import { SYNC_CALENDAR_ID, syncSessionToCalendar, type SessionForSync, type SyncStore } from "./gcal";

/**
 * Stage 2 outbound proof: send one future, scheduled lesson to the Google test
 * calendar. Owner-only, and the connector is never touched from the browser.
 */
export const syncSessionToGoogle = createServerFn({ method: "POST" })
  .middleware([requireOwner])
  .inputValidator((data) => z.object({ session_id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);

    const { data: row, error } = await client
      .from("sessions")
      .select(
        "id, code, starts_at, ends_at, room, status, google_event_id, tutors(full_name), class_offerings(code, room, programs(name))",
      )
      .eq("id", data.session_id)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("That lesson no longer exists.");
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
      google_event_id: row.google_event_id ?? null,
    };

    const store: SyncStore = {
      markPending: async (id) => {
        await client.from("sessions").update({ calendar_sync_status: "pending" }).eq("id", id);
      },
      markSynced: async (id, calendarId, eventId) => {
        const { error: updateError } = await client
          .from("sessions")
          .update({
            google_calendar_id: calendarId,
            google_event_id: eventId,
            calendar_sync_status: "synced",
            calendar_last_synced_at: new Date().toISOString(),
          })
          .eq("id", id);
        if (updateError) throw updateError;
      },
      markFailed: async (id) => {
        await client.from("sessions").update({ calendar_sync_status: "failed" }).eq("id", id);
      },
    };

    const { googleCalendarApi } = await import("./google-calendar.server");
    return syncSessionToCalendar(session, googleCalendarApi, store, SYNC_CALENDAR_ID);
  });
