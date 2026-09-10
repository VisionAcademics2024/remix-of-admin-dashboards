import type { StaffRole } from "./types";

/**
 * Who may write up a lesson.
 *
 * One note per lesson, shared: the office and the tutor in the room write the
 * same `sessions.notes`, so whatever either records the other reads. That is
 * the point of it - a note only the tutor can see is a diary, and a note only
 * the office can see is not a handover.
 *
 * Writing it was routed through a SECURITY DEFINER function, `set_session_notes`,
 * because a tutor has no UPDATE on `sessions` under RLS. That function lives in
 * a migration, and until the migration is applied every tutor pressing Save got
 * "Could not find the function public.set_session_notes in the schema cache" -
 * a database error, in front of a person who cannot apply a database migration.
 *
 * So the question moves here, into code that ships with the app and can be
 * tested. It asks exactly what the SQL asked - `is_staff() OR (is_tutor() AND
 * teaches_session())` - and the write that follows it touches one column of one
 * row. Reads are untouched and stay under RLS, so a tutor still sees only the
 * lessons they are allowed to see.
 */
export function mayWriteSessionNotes(
  staff: { role: StaffRole; tutor_id?: string | null },
  session: { tutor_id?: string | null },
): boolean {
  // The office runs the schedule and writes up any lesson on it.
  if (staff.role === "owner" || staff.role === "admin") return true;

  // Anything that is not a tutor and not the office has no business here.
  if (staff.role !== "tutor") return false;

  // An unlinked tutor account teaches nothing, so it can write up nothing.
  // Failing closed matters more here than being helpful: the alternative is an
  // account with no tutor behind it writing on lessons at large.
  if (!staff.tutor_id) return false;

  // A lesson with no tutor is nobody's to write up until the office assigns one.
  if (!session.tutor_id) return false;

  return session.tutor_id === staff.tutor_id;
}

/**
 * Who may READ a lesson note.
 *
 * The same line as writing, drawn for the other direction, and it had been
 * missing: a tutor reads the whole calendar on purpose - they need to know what
 * is on - and `sessions` rows arrive whole, so the note on every class in the
 * school came with them. A note is written for the family it is about and for
 * the people teaching them, not for the staffroom at large.
 *
 * Row-level security cannot mask one column, and v_sessions is `select s.*`,
 * so the masking is done in the read path instead: the API drops the column
 * before it leaves. That hides notes from the app, not from the database.
 */
export function mayReadSessionNotes(
  staff: { role: StaffRole | null | undefined; tutor_id?: string | null },
  session: { tutor_id?: string | null },
): boolean {
  if (staff.role === "owner" || staff.role === "admin") return true;
  if (staff.role !== "tutor") return false;
  if (!staff.tutor_id) return false;
  if (!session.tutor_id) return false;
  return session.tutor_id === staff.tutor_id;
}

/**
 * The same row with `notes` blanked when this reader is not entitled to it.
 *
 * Applied at every point a session leaves the server, so the screen is never
 * trusted to hide something it was handed.
 */
export function redactNotes<T extends { tutor_id?: string | null; notes?: unknown }>(
  staff: { role: StaffRole | null | undefined; tutor_id?: string | null },
  session: T,
): T {
  if (mayReadSessionNotes(staff, session)) return session;
  return { ...session, notes: null };
}
