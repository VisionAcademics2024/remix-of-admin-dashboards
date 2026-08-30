import { describe, expect, it, vi } from "vitest";

import {
  SYNC_CALENDAR_ID,
  isMappedSession,
  nextSyncStatusAfterReschedule,
  withPendingSync,
  updateMappedSessionEvent,
  type CalendarApi,
  type SessionForSync,
  type SyncStore,
} from "./gcal";
import {
  nextSyncView,
  syncAfterReschedule,
  syncTone,
  syncViewFromSession,
} from "./calendar-sync";
import { reschedulePatch } from "./schedule.rules";

const mapped = {
  google_calendar_id: SYNC_CALENDAR_ID,
  google_event_id: "evt_1",
  calendar_sync_status: "synced",
};

const session: SessionForSync = {
  id: "11111111-2222-3333-4444-555555555555",
  code: "SES-0100",
  starts_at: "2026-09-01T06:00:00+00:00",
  ends_at: "2026-09-01T07:30:00+00:00",
  room: "Room 2",
  tutor_name: "Alice Tutor",
  program_name: "Year 9 Maths Advanced",
  offering_code: "OFF-0007",
  google_event_id: "evt_1",
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

describe("mapping gate", () => {
  it("accepts only a lesson with both ids on the sync test calendar", () => {
    expect(isMappedSession(mapped)).toBe(true);
    expect(isMappedSession({ ...mapped, google_event_id: null })).toBe(false);
    expect(isMappedSession({ ...mapped, google_calendar_id: null })).toBe(false);
    expect(isMappedSession({ ...mapped, google_calendar_id: "other@group.calendar" })).toBe(false);
    expect(isMappedSession(null)).toBe(false);
  });

  it("never lets an unlinked lesson reach the Google transport", async () => {
    const sync = vi.fn();
    const outcome = await syncAfterReschedule(
      { google_calendar_id: null, google_event_id: null, calendar_sync_status: "not_synced" },
      sync,
      session.id,
    );
    expect(sync).not.toHaveBeenCalled();
    expect(outcome).toEqual({ attempted: false, ok: true });
  });

  it("sends a mapped lesson once, by id", async () => {
    const sync = vi.fn().mockResolvedValue({ ok: true });
    const outcome = await syncAfterReschedule(mapped, sync, session.id);
    expect(sync).toHaveBeenCalledWith(session.id);
    expect(outcome).toEqual({ attempted: true, ok: true });
  });
});

describe("update only", () => {
  it("updates the stored event and never creates one", async () => {
    const api: CalendarApi = {
      findEventBySessionId: vi.fn(),
      createEvent: vi.fn(),
      updateEvent: vi.fn().mockResolvedValue({ id: "evt_1" }),
    };
    const s = store();

    const outcome = await updateMappedSessionEvent(session, api, s);
    expect(outcome.action).toBe("update");
    expect(outcome.event_id).toBe("evt_1");
    expect(api.updateEvent).toHaveBeenCalledWith(SYNC_CALENDAR_ID, "evt_1", expect.any(Object));
    expect(api.createEvent).not.toHaveBeenCalled();
    expect(api.findEventBySessionId).not.toHaveBeenCalled();
    expect(s.calls).toEqual(["pending", "synced"]);
  });

  it("refuses a lesson with no stored event", async () => {
    const api = { updateEvent: vi.fn() };
    const s = store();
    await expect(
      updateMappedSessionEvent({ ...session, google_event_id: null }, api, s),
    ).rejects.toThrow(/not linked/);
    expect(api.updateEvent).not.toHaveBeenCalled();
    expect(s.calls).toEqual([]);
  });

  it("marks failed and reports a retry, without touching the schedule", async () => {
    const api = { updateEvent: vi.fn().mockRejectedValue(new Error("failed [503]")) };
    const s = store();
    await expect(updateMappedSessionEvent(session, api, s)).rejects.toThrow(
      /moved on the timetable/,
    );
    expect(s.calls).toEqual(["pending", "failed"]);
  });
});

describe("google failure is not a scheduling failure", () => {
  it("returns a warning instead of throwing, so the timetable is never rolled back", async () => {
    const rollback = vi.fn();
    const sync = vi.fn().mockRejectedValue(new Error("SES-0100 moved on the timetable, but..."));

    const outcome = await syncAfterReschedule(mapped, sync, session.id).catch(() => {
      rollback();
      return null;
    });

    expect(rollback).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ attempted: true, ok: false });
    expect(outcome?.message).toContain("moved on the timetable");
  });
});

describe("reschedule status", () => {
  it("queues a mapped lesson and leaves an unlinked one alone", () => {
    expect(nextSyncStatusAfterReschedule(mapped)).toBe("pending");
    expect(
      nextSyncStatusAfterReschedule({
        google_calendar_id: null,
        google_event_id: null,
        calendar_sync_status: "not_synced",
      }),
    ).toBeNull();
    expect(nextSyncStatusAfterReschedule({ ...mapped, google_calendar_id: "other" })).toBeNull();
  });
});

describe("atomic reschedule payload", () => {
  it("folds pending into the one update for a mapped lesson", () => {
    const patch = {
      starts_at: "2026-09-02T06:00:00.000Z",
      ends_at: "2026-09-02T07:30:00.000Z",
      original_starts_at: "2026-09-01T06:00:00.000Z",
      original_ends_at: "2026-09-01T07:30:00.000Z",
    };
    expect(withPendingSync(patch, mapped)).toEqual({ ...patch, calendar_sync_status: "pending" });
  });

  it("leaves an unlinked lesson's payload and status untouched", () => {
    const patch = { starts_at: "a", ends_at: "b" };
    const out = withPendingSync(patch, {
      google_calendar_id: null,
      google_event_id: null,
      calendar_sync_status: "not_synced",
    });
    expect(out).toEqual(patch);
    expect("calendar_sync_status" in out).toBe(false);
  });

  it("reschedules a mapped lesson with a single sessions update", async () => {
    const updates: Record<string, unknown>[] = [];
    // The point of the atomic payload: one write, so a status failure cannot
    // report a scheduling failure after the lesson has already moved.
    const save = async (payload: Record<string, unknown>) => {
      updates.push(payload);
    };
    await save(
      withPendingSync(
        reschedulePatch(
          { starts_at: "2026-09-01T06:00:00Z", ends_at: "2026-09-01T07:30:00Z" },
          "2026-09-02T06:00:00Z",
          "2026-09-02T07:30:00Z",
        ),
        mapped,
      ),
    );
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ calendar_sync_status: "pending" });
  });
});

describe("failed status persistence", () => {
  it("surfaces the status-write failure while saying the move is saved", async () => {
    const api = { updateEvent: vi.fn().mockRejectedValue(new Error("google 503")) };
    const store: SyncStore = {
      markPending: async () => {},
      markSynced: async () => {},
      markFailed: async () => {
        throw new Error("row is locked");
      },
    };
    await expect(updateMappedSessionEvent(session, api, store)).rejects.toThrow(
      /that move is saved.*failed state could not be recorded.*google 503.*row is locked/s,
    );
  });

  it("still reports the saved move when the failed state is recorded", async () => {
    const api = { updateEvent: vi.fn().mockRejectedValue(new Error("google 503")) };
    const s = store();
    await expect(updateMappedSessionEvent(session, api, s)).rejects.toThrow(
      /that move is saved, but Google Calendar was not updated/,
    );
    expect(s.calls).toEqual(["pending", "failed"]);
  });
});

describe("dialog sync view", () => {
  it("a successful retry cannot stay failed", () => {
    const start = syncViewFromSession("failed", "2026-08-01T00:00:00Z");
    expect(start.status).toBe("failed");
    const running = nextSyncView(start, { type: "start" });
    expect(running.status).toBe("pending");
    const done = nextSyncView(running, { type: "success", at: "2026-08-30T02:00:00Z" });
    expect(done).toEqual({ status: "synced", lastSyncedAt: "2026-08-30T02:00:00Z" });
    expect(syncTone(done.status)).toBe("success");
  });

  it("a failed retry stays visible and keeps the last known sync time", () => {
    const view = nextSyncView(
      nextSyncView(syncViewFromSession("synced", "2026-08-01T00:00:00Z"), { type: "start" }),
      { type: "failure" },
    );
    expect(view).toEqual({ status: "failed", lastSyncedAt: "2026-08-01T00:00:00Z" });
    expect(syncTone("failed")).toBe("danger");
  });

  it("falls back to not_synced for an unknown stored status", () => {
    expect(syncViewFromSession(null, null)).toEqual({ status: "not_synced", lastSyncedAt: null });
    expect(syncViewFromSession("weird", undefined).status).toBe("not_synced");
  });
});
