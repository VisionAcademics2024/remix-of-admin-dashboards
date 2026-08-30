import { describe, expect, it, vi } from "vitest";

import {
  SYDNEY_TZ,
  SYNC_CALENDAR_ID,
  buildEventPayload,
  chooseSyncAction,
  syncSessionToCalendar,
  type CalendarApi,
  type SessionForSync,
  type SyncStore,
} from "./gcal";

const session: SessionForSync = {
  id: "11111111-2222-3333-4444-555555555555",
  code: "SES-0100",
  starts_at: "2026-09-01T06:00:00+00:00",
  ends_at: "2026-09-01T07:30:00+00:00",
  room: "Room 2",
  tutor_name: "Alice Tutor",
  program_name: "Year 9 Maths Advanced",
  offering_code: "OFF-0007",
  google_event_id: null,
};

function store(): SyncStore & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    markPending: async () => void calls.push("pending"),
    markSynced: async () => void calls.push("synced"),
    markFailed: async () => void calls.push("failed"),
  };
}

describe("event payload privacy", () => {
  const payload = buildEventPayload(session);
  const serialised = JSON.stringify(payload);

  it("carries only class, offering, room, tutor and session code", () => {
    expect(payload.summary).toBe("Year 9 Maths Advanced - OFF-0007");
    expect(payload.location).toBe("Room 2");
    expect(payload.description).toBe("Tutor: Alice Tutor\nSession: SES-0100");
  });

  it("never adds guests or recurrence", () => {
    expect(serialised).not.toContain("attendees");
    expect(serialised).not.toContain("recurrence");
  });

  it("leaks no commercial or student fields", () => {
    for (const forbidden of [
      "student",
      "guardian",
      "enrolment",
      "attendance",
      "charge",
      "invoice",
      "hours",
      "balance",
      "payout",
      "price",
    ]) {
      expect(serialised.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("tags the event with the private session id only", () => {
    expect(payload.extendedProperties.private).toEqual({ vision_session_id: session.id });
  });

  it("omits location when there is no room", () => {
    expect(buildEventPayload({ ...session, room: null }).location).toBeUndefined();
  });
});

describe("Sydney timezone", () => {
  it("sends both ends of the lesson in Australia/Sydney", () => {
    const payload = buildEventPayload(session);
    expect(SYDNEY_TZ).toBe("Australia/Sydney");
    expect(payload.start).toEqual({ dateTime: session.starts_at, timeZone: "Australia/Sydney" });
    expect(payload.end).toEqual({ dateTime: session.ends_at, timeZone: "Australia/Sydney" });
  });
});

describe("create versus update", () => {
  it("creates only when neither a stored nor a found event exists", () => {
    expect(chooseSyncAction(null, null)).toEqual({ action: "create", eventId: null });
  });

  it("prefers the stored event id", () => {
    expect(chooseSyncAction("stored", "found")).toEqual({ action: "update", eventId: "stored" });
  });

  it("updates a matching event discovered on the calendar", () => {
    expect(chooseSyncAction(null, "found")).toEqual({ action: "update", eventId: "found" });
  });
});

describe("idempotency", () => {
  it("searches by private session id and creates once, then updates", async () => {
    const created = { id: "evt_1" };
    const api: CalendarApi = {
      findEventBySessionId: vi.fn().mockResolvedValue(null),
      createEvent: vi.fn().mockResolvedValue(created),
      updateEvent: vi.fn().mockResolvedValue(created),
    };
    const s = store();

    const first = await syncSessionToCalendar(session, api, s);
    expect(first.action).toBe("create");
    expect(first.event_id).toBe("evt_1");
    expect(first.calendar_id).toBe(SYNC_CALENDAR_ID);
    expect(api.findEventBySessionId).toHaveBeenCalledWith(SYNC_CALENDAR_ID, session.id);
    expect(s.calls).toEqual(["pending", "synced"]);

    const second = await syncSessionToCalendar(
      { ...session, google_event_id: "evt_1" },
      api,
      store(),
    );
    expect(second.action).toBe("update");
    expect(second.event_id).toBe("evt_1");
    expect(api.createEvent).toHaveBeenCalledTimes(1);
    expect(api.updateEvent).toHaveBeenCalledWith(SYNC_CALENDAR_ID, "evt_1", expect.any(Object));
  });

  it("reuses an event found on the calendar instead of creating a duplicate", async () => {
    const api: CalendarApi = {
      findEventBySessionId: vi.fn().mockResolvedValue("evt_existing"),
      createEvent: vi.fn(),
      updateEvent: vi.fn().mockResolvedValue({ id: "evt_existing" }),
    };
    const outcome = await syncSessionToCalendar(session, api, store());
    expect(outcome.action).toBe("update");
    expect(api.createEvent).not.toHaveBeenCalled();
  });
});

describe("failed status behaviour", () => {
  it("marks the lesson failed and returns a safe error on connector failure", async () => {
    const api: CalendarApi = {
      findEventBySessionId: vi.fn().mockResolvedValue(null),
      createEvent: vi.fn().mockRejectedValue(new Error("Google Calendar request failed [503].")),
      updateEvent: vi.fn(),
    };
    const s = store();

    await expect(syncSessionToCalendar(session, api, s)).rejects.toThrow(/SES-0100/);
    expect(s.calls).toEqual(["pending", "failed"]);
  });

  it("does not mark synced when the store write fails", async () => {
    const api: CalendarApi = {
      findEventBySessionId: vi.fn().mockResolvedValue(null),
      createEvent: vi.fn().mockResolvedValue({ id: "evt_2" }),
      updateEvent: vi.fn(),
    };
    const s = store();
    s.markSynced = async () => {
      s.calls.push("synced-attempt");
      throw new Error("db unavailable");
    };

    await expect(syncSessionToCalendar(session, api, s)).rejects.toThrow(/SES-0100/);
    expect(s.calls).toEqual(["pending", "synced-attempt", "failed"]);
  });
});
