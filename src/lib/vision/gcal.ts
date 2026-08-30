/**
 * Stage 2 outbound Google Calendar proof.
 *
 * Everything in this file is transport-free so the payload rules (privacy,
 * Sydney wall clock, create-versus-update) can be tested without a network or a
 * database. The gateway client lives in ./google-calendar.server.ts and the
 * server operation in ./calendar.functions.ts.
 */

/** The only calendar this stage is allowed to write to. */
export const SYNC_CALENDAR_ID =
  "c_535884a4c162ab4eb4ae571f8092d7c42df8f0d1438890b2724242dc2b48865c@group.calendar.google.com";

export const SYDNEY_TZ = "Australia/Sydney";

/** The narrow slice of a lesson that may leave the building. */
export type SessionForSync = {
  id: string;
  code: string;
  starts_at: string;
  ends_at: string;
  room: string | null;
  tutor_name: string | null;
  program_name: string | null;
  offering_code: string | null;
  google_event_id: string | null;
};

export type CalendarEventPayload = {
  summary: string;
  location?: string;
  description?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  extendedProperties: { private: { vision_session_id: string } };
};

/**
 * Class/program and offering identifier in the title, room in the location,
 * tutor name and Session code in the description. Nothing else: no student or
 * guardian names, no attendance, enrolment, billing or pay information, and no
 * guests.
 */
export function buildEventPayload(session: SessionForSync): CalendarEventPayload {
  const title = [session.program_name ?? "Class", session.offering_code]
    .filter(Boolean)
    .join(" - ");

  const description = [
    session.tutor_name ? `Tutor: ${session.tutor_name}` : null,
    `Session: ${session.code}`,
  ]
    .filter(Boolean)
    .join("\n");

  const payload: CalendarEventPayload = {
    summary: title,
    start: { dateTime: session.starts_at, timeZone: SYDNEY_TZ },
    end: { dateTime: session.ends_at, timeZone: SYDNEY_TZ },
    extendedProperties: { private: { vision_session_id: session.id } },
    description,
  };
  if (session.room) payload.location = session.room;
  return payload;
}

export type SyncAction = "create" | "update";

/**
 * A stored event id wins; otherwise the calendar is searched for an event
 * already carrying this lesson's private vision_session_id. Only when neither
 * exists is a new event created, so repeated calls cannot duplicate.
 */
export function chooseSyncAction(
  storedEventId: string | null,
  foundEventId: string | null,
): { action: SyncAction; eventId: string | null } {
  const eventId = storedEventId ?? foundEventId;
  return eventId ? { action: "update", eventId } : { action: "create", eventId: null };
}

export type CalendarApi = {
  findEventBySessionId: (calendarId: string, sessionId: string) => Promise<string | null>;
  createEvent: (calendarId: string, body: CalendarEventPayload) => Promise<{ id: string }>;
  updateEvent: (
    calendarId: string,
    eventId: string,
    body: CalendarEventPayload,
  ) => Promise<{ id: string }>;
};

export type SyncStore = {
  markPending: (sessionId: string) => Promise<void>;
  markSynced: (sessionId: string, calendarId: string, eventId: string) => Promise<void>;
  markFailed: (sessionId: string) => Promise<void>;
};

export type SyncOutcome = {
  session_id: string;
  session_code: string;
  action: SyncAction;
  event_id: string;
  calendar_id: string;
};

/**
 * The one outbound path. A connector failure never rolls back the scheduling
 * change already in the database - the lesson simply ends up `failed`.
 */
export async function syncSessionToCalendar(
  session: SessionForSync,
  api: CalendarApi,
  store: SyncStore,
  calendarId: string = SYNC_CALENDAR_ID,
): Promise<SyncOutcome> {
  await store.markPending(session.id);
  try {
    const found = session.google_event_id
      ? null
      : await api.findEventBySessionId(calendarId, session.id);
    const { action, eventId } = chooseSyncAction(session.google_event_id, found);
    const body = buildEventPayload(session);

    const result =
      action === "update"
        ? await api.updateEvent(calendarId, eventId!, body)
        : await api.createEvent(calendarId, body);

    await store.markSynced(session.id, calendarId, result.id);
    return {
      session_id: session.id,
      session_code: session.code,
      action,
      event_id: result.id,
      calendar_id: calendarId,
    };
  } catch (error) {
    await store.markFailed(session.id);
    throw new Error(
      `Could not send ${session.code} to Google Calendar. ${
        error instanceof Error ? error.message : "The calendar service did not respond."
      }`,
    );
  }
}
