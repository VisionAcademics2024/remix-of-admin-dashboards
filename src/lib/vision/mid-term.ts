/**
 * Adding a student part-way through a term - the rules, stated once.
 *
 * A mid-term joiner is not a new class. They are a person who turns up to a
 * handful of specific lessons, sometimes across two classes at once, and
 * sometimes having *already* turned up to a few before anyone got around to
 * putting them in the system. Both halves have to be billable:
 *
 *   * the lessons still to come - a roll entry, left unmarked, so the tutor
 *     marks them on the day;
 *   * the backlog - lessons already taught, which are the whole reason the
 *     family owes anything yet. These go on as `present`, because that is what
 *     happened, and because a roll entry that is not present consumes no hours
 *     (see `hours_consumed` in v_attendance) and so bills nobody.
 *
 * The second half is what this module exists for. Billing's audit has a
 * finding called "On hours, but no package was ever bought" - the case where
 * lessons are taught against an hours enrolment that has nothing to invoice.
 * A mid-term join used to land there by construction: the roll went on first
 * and the package was created last, so every entry pointed at nothing and the
 * package it was meant to draw from arrived too late to be attached. The order
 * is now package first, eligibility second, roll third, and the numbers below
 * are what tells the admin how many hours to buy in the first place.
 *
 * The rules are pure so they can be tested without a database, and so the
 * screen and the server agree on what "3 lessons, 4.5 hours, 2 already taught"
 * means rather than each counting it their own way.
 */

/** A lesson offered in the picker, past or future. */
export interface JoinableLesson {
  id: string;
  /** Sydney calendar date, "YYYY-MM-DD" - what decides past from future. */
  session_date: string;
  /** Length of the lesson, which is what it costs in hours. */
  duration_hours: number;
  /** True when this student is already on this lesson's roll. */
  on_roll?: boolean;
}

/** A date typed in by hand because the lesson is not on the timetable yet. */
export interface AddedLesson {
  /** Client-side key only; the server resolves or creates the real session. */
  tempId: string;
  starts_at: string;
  ends_at: string;
  /** Whether the student actually sat in it - true for a backlog date. */
  attended: boolean;
}

/** One class in the builder, with whatever has been ticked on it. */
export interface ClassSelection {
  class_offering_id: string;
  /** Every lesson the picker offered for this class. */
  lessons: JoinableLesson[];
  /** The ticked lesson ids. */
  selected: string[];
  /** Off-timetable dates typed in for this class. */
  added: AddedLesson[];
}

/** What the server is asked to do for one class. */
export interface MidTermClassPayload {
  class_offering_id: string;
  /** Lessons still to come: a roll entry, left unmarked. */
  session_ids: string[];
  /** Lessons already taught: a roll entry marked present, so they bill. */
  attended_session_ids: string[];
  new_sessions: Array<{ starts_at: string; ends_at: string; attended: boolean }>;
}

/**
 * Is this lesson part of the backlog?
 *
 * A lesson on today's date is not backlog. Today's class may not have run yet,
 * and guessing that it did would mark a student present for a lesson they have
 * not sat in - a wrong bill, made silently. Ticking it still adds them to the
 * roll; the tutor marks it as usual.
 */
export function isBacklog(lesson: Pick<JoinableLesson, "session_date">, today: string): boolean {
  return lesson.session_date < today;
}

/** The lessons split the way the picker shows them: what has been, what is coming. */
export function splitLessons(
  lessons: JoinableLesson[],
  today: string,
): { backlog: JoinableLesson[]; upcoming: JoinableLesson[] } {
  const backlog = lessons.filter((l) => isBacklog(l, today));
  const upcoming = lessons.filter((l) => !isBacklog(l, today));
  // Backlog reads newest-first: the lesson most likely to be owed for is the
  // one that just happened, not the one from two months ago.
  backlog.sort((a, b) => b.session_date.localeCompare(a.session_date));
  upcoming.sort((a, b) => a.session_date.localeCompare(b.session_date));
  return { backlog, upcoming };
}

/** Hours in one hand-typed date, from the window it occupies. */
export function addedLessonHours(added: Pick<AddedLesson, "starts_at" | "ends_at">): number {
  const hours = (Date.parse(added.ends_at) - Date.parse(added.starts_at)) / 3_600_000;
  return Number.isFinite(hours) && hours > 0 ? hours : 0;
}

/**
 * What one class's ticks add up to.
 *
 * A lesson the student is already on the roll for is counted as neither new
 * work nor new hours: it is already there, already billable, and adding it a
 * second time is not something anyone wants to pay for.
 */
export function tallySelection(
  selection: ClassSelection,
  today: string,
): { lessons: number; hours: number; backlogLessons: number; backlogHours: number } {
  const picked = new Set(selection.selected);
  let lessons = 0;
  let hours = 0;
  let backlogLessons = 0;
  let backlogHours = 0;

  for (const lesson of selection.lessons) {
    if (!picked.has(lesson.id) || lesson.on_roll) continue;
    const h = Number(lesson.duration_hours ?? 0);
    lessons += 1;
    hours += h;
    if (isBacklog(lesson, today)) {
      backlogLessons += 1;
      backlogHours += h;
    }
  }

  for (const added of selection.added) {
    const h = addedLessonHours(added);
    lessons += 1;
    hours += h;
    if (added.attended) {
      backlogLessons += 1;
      backlogHours += h;
    }
  }

  return { lessons, hours: round2(hours), backlogLessons, backlogHours: round2(backlogHours) };
}

/** The same tally across every class in the builder. */
export function tallyAll(
  selections: ClassSelection[],
  today: string,
): {
  lessons: number;
  hours: number;
  backlogLessons: number;
  backlogHours: number;
  classes: number;
} {
  let lessons = 0;
  let hours = 0;
  let backlogLessons = 0;
  let backlogHours = 0;
  let classes = 0;

  for (const selection of selections) {
    const tally = tallySelection(selection, today);
    if (tally.lessons > 0) classes += 1;
    lessons += tally.lessons;
    hours += tally.hours;
    backlogLessons += tally.backlogLessons;
    backlogHours += tally.backlogHours;
  }

  return {
    lessons,
    hours: round2(hours),
    backlogLessons,
    backlogHours: round2(backlogHours),
    classes,
  };
}

/**
 * The payload for addMidTermStudent.
 *
 * Ticks become two lists, not one, because past and future are different
 * instructions: the backlog is marked present so it bills, the rest is left
 * for the tutor. Classes with nothing ticked are dropped rather than sent as
 * empty entries - an enrolment nobody chose any lessons for is not something
 * to create.
 *
 * A lesson the student is already on the roll for is filtered out here too, so
 * re-opening the builder to add one more date does not re-send the roll they
 * already have.
 */
export function buildMidTermClasses(
  selections: ClassSelection[],
  today: string,
): MidTermClassPayload[] {
  const payload: MidTermClassPayload[] = [];

  for (const selection of selections) {
    const picked = new Set(selection.selected);
    const byId = new Map(selection.lessons.map((l) => [l.id, l]));

    const attended_session_ids: string[] = [];
    const session_ids: string[] = [];
    for (const id of selection.selected) {
      const lesson = byId.get(id);
      if (!lesson || !picked.has(id) || lesson.on_roll) continue;
      (isBacklog(lesson, today) ? attended_session_ids : session_ids).push(id);
    }

    const new_sessions = selection.added.map((a) => ({
      starts_at: a.starts_at,
      ends_at: a.ends_at,
      attended: a.attended,
    }));

    if (!attended_session_ids.length && !session_ids.length && !new_sessions.length) continue;
    payload.push({
      class_offering_id: selection.class_offering_id,
      session_ids,
      attended_session_ids,
      new_sessions,
    });
  }

  return payload;
}

/**
 * The hours to buy, suggested from the lessons chosen.
 *
 * "Bill them for what they are booked in for" is the ordinary case, and it
 * covers the backlog as well as the lessons to come - both are taught, both
 * are owed. It is a suggestion and not a rule: a family can buy ten hours and
 * be booked into six, and the admin types what was agreed. Rounded up to the
 * nearest half hour, which is how blocks are actually sold.
 */
export function suggestedHours(selections: ClassSelection[], today: string): number {
  return Math.ceil(tallyAll(selections, today).hours * 2) / 2;
}

/** Two decimals, so adding 1.5s never reads as 4.499999999999999. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
