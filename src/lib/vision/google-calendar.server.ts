/**
 * Server-only Google Calendar transport. Every call goes through the Lovable
 * connector gateway using the linked "Vision's Google Calendar" connection, so
 * no OAuth, service account or provider API key lives in this app.
 */
import type { CalendarApi, CalendarEventPayload } from "./gcal";

const GATEWAY = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";

function headers(): Record<string, string> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["GOOGLE_CALENDAR_API_KEY"];
  if (!lovableKey || !connectionKey) {
    throw new Error("The Google Calendar connection is not available on this server.");
  }
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connectionKey,
    "Content-Type": "application/json",
  };
}

async function call(method: string, path: string, body?: unknown): Promise<unknown> {
  const init: RequestInit = { method, headers: headers() };
  if (body !== undefined) init.body = JSON.stringify(body);
  const response = await fetch(`${GATEWAY}${path}`, init);
  const text = await response.text();
  if (!response.ok) {
    console.error(`Google Calendar request failed [${response.status}]: ${text}`);
    throw new Error(`Google Calendar request failed [${response.status}].`);
  }
  return text ? JSON.parse(text) : {};
}

export const googleCalendarApi: CalendarApi = {
  async findEventBySessionId(calendarId, sessionId) {
    const params = new URLSearchParams({
      privateExtendedProperty: `vision_session_id=${sessionId}`,
      maxResults: "5",
      showDeleted: "false",
    });
    const data = (await call(
      "GET",
      `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
    )) as { items?: Array<{ id?: string }> };
    return data.items?.[0]?.id ?? null;
  },

  async createEvent(calendarId, body: CalendarEventPayload) {
    const data = (await call(
      "POST",
      `/calendars/${encodeURIComponent(calendarId)}/events`,
      body,
    )) as { id?: string };
    if (!data.id) throw new Error("Google Calendar did not return an event id.");
    return { id: data.id };
  },

  async updateEvent(calendarId, eventId, body: CalendarEventPayload) {
    const data = (await call(
      "PATCH",
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      body,
    )) as { id?: string };
    return { id: data.id ?? eventId };
  },
};
