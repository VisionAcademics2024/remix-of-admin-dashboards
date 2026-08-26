/**
 * The rules that decide whether a lesson may be moved, and what the moved row
 * should look like. Kept pure and separate from the server function so they can
 * be tested directly - the server function is the only caller and adds nothing
 * of its own beyond reading the database.
 */

export type RescheduleCurrent = {
  starts_at: string;
  ends_at: string;
  original_starts_at?: string | null;
  original_ends_at?: string | null;
};

export type ReschedulePatch = {
  starts_at: string;
  ends_at: string;
  original_starts_at: string;
  original_ends_at: string;
};

/** Times are real instants and the lesson ends after it starts. */
export function validateProposedTimes(startsAt: string, endsAt: string, now: number) {
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    throw new Error("That start or end time is not a real date and time.");
  }
  if (end <= start) {
    throw new Error("The lesson has to end after it starts.");
  }
  if (start <= now) {
    throw new Error("Pick a time in the future - a lesson cannot be moved into the past.");
  }
  return { start, end };
}

/** A lesson that has started, or has passed, is history and stays put. */
export function assertReschedulable(current: RescheduleCurrent, now: number) {
  if (Date.parse(current.starts_at) <= now) {
    throw new Error(
      "This lesson has already started or has passed. Cancel it and add a new one instead.",
    );
  }
}

/** A marked roll is a record of what happened, so the time is settled. */
export function assertRollUnmarked(markedCount: number) {
  if (markedCount > 0) {
    throw new Error(
      "The roll for this lesson has been marked, so its time is now part of the record. Cancel it and add a new lesson instead.",
    );
  }
}

/**
 * The columns a reschedule writes - and only those. No session_type, no status:
 * an ordinary move stays an ordinary lesson. The first move remembers the slot
 * it came from; later moves keep that first memory (coalesce semantics).
 */
export function reschedulePatch(
  current: RescheduleCurrent,
  startsAt: string,
  endsAt: string,
): ReschedulePatch {
  return {
    starts_at: new Date(Date.parse(startsAt)).toISOString(),
    ends_at: new Date(Date.parse(endsAt)).toISOString(),
    original_starts_at: current.original_starts_at ?? current.starts_at,
    original_ends_at: current.original_ends_at ?? current.ends_at,
  };
}
