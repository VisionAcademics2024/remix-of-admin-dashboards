import type { StaffRole } from "./types";

/**
 * What each role may do to a lesson, in one place.
 *
 * The database already draws this line and draws it properly: since the tutor
 * access migration, `is_staff()` means owner-or-admin, so a tutor has SELECT on
 * sessions and no UPDATE at all. What the database cannot do is tell the
 * screen. A tutor was still shown draggable lessons, editable times, a tutor
 * dropdown, Cancel and Delete - every one of which reaches the server, passes
 * `requireStaff` (which only asks for an active staff row, not a role), and
 * then quietly changes nothing because RLS matches no rows. A write that
 * reports success and does nothing is worse than one that is refused.
 *
 * So the same line is drawn three times over: here for the screen, in
 * `requireManager` for the API, and in RLS for the data. This module is the one
 * a person reads to know what a tutor can do.
 */

export interface LessonPermissions {
  /** Move a lesson to another slot - by dragging it, or by typing new times. */
  reschedule: boolean;
  /** Reassign the tutor, change the room, cancel or delete, enrol a student. */
  manage: boolean;
  /** Say who turned up. The person in the room is the one who knows. */
  markRoll: boolean;
  /** Write down what happened in this lesson. */
  notes: boolean;
}

const NONE: LessonPermissions = {
  reschedule: false,
  manage: false,
  markRoll: false,
  notes: false,
};

/**
 * A tutor teaches: they mark their roll and write up the lesson, and that is
 * all. Moving a class is a scheduling decision with a tutor's pay, a family's
 * calendar and a room booking behind it, so it stays with the office.
 *
 * An unknown or missing role gets nothing rather than something. A screen that
 * has not yet loaded who you are must not offer a destructive button on the
 * assumption it will turn out fine.
 */
export function lessonPermissions(role: StaffRole | null | undefined): LessonPermissions {
  switch (role) {
    case "owner":
    case "admin":
      return { reschedule: true, manage: true, markRoll: true, notes: true };
    case "tutor":
      return { reschedule: false, manage: false, markRoll: true, notes: true };
    default:
      return NONE;
  }
}

/**
 * Whether this person may mark THIS lesson's roll.
 *
 * `lessonPermissions` answers by role alone, which is as much as it can know:
 * every tutor marks rolls, so it returns markRoll: true for all of them. The
 * screen then drew the tick, the cross and Make-up on every lesson in the
 * school, including the ones taught by somebody else - and RLS refused the
 * write, so pressing them did nothing at all and said nothing about it.
 *
 * So the session-scoped question lives here, in the same shape as
 * `mayWriteSessionNotes`: a tutor marks the lesson they teach and no other.
 * Fails closed - an account with no tutor behind it, or a lesson nobody has
 * been assigned to yet, marks nothing.
 */
/**
 * Who is looking, as much of it as a permission question needs: the role, and
 * which tutor the account is linked to. Screens hold this shape rather than the
 * whole staff record so the rules can be asked from anywhere.
 */
export type Viewer = { role: StaffRole | null | undefined; tutor_id?: string | null } | null;

export function mayMarkRoll(
  staff: { role: StaffRole | null | undefined; tutor_id?: string | null },
  session: { tutor_id?: string | null },
): boolean {
  if (staff.role === "owner" || staff.role === "admin") return true;
  if (staff.role !== "tutor") return false;
  if (!staff.tutor_id) return false;
  if (!session.tutor_id) return false;
  return staff.tutor_id === session.tutor_id;
}

/** Owner or admin - the two roles that run the schedule. */
export function isManager(role: StaffRole | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

/**
 * "You are signed in as one person and looking at another's lessons."
 *
 * A tutor account carries a `tutor_id`, and everything a tutor sees - the
 * calendar they can mark, their pay - is scoped to it rather than to their
 * name. The two are set separately and nothing makes them agree, so an account
 * named one thing can be linked to a different tutor entirely and the app will
 * cheerfully show that tutor's fortnight, their lessons and their pay.
 *
 * That is not hypothetical: the tutor test login was deliberately pointed at a
 * real tutor's record so it would have lessons to show, and anyone signing in
 * with it sees that tutor's pay under their own heading. Nothing said so.
 *
 * Code cannot know which of the two is right - only an owner can. So this says
 * plainly that they disagree, and leaves the fixing to the Staff page.
 */
export function linkedTutorMismatch(
  staffName: string | null | undefined,
  tutorName: string | null | undefined,
): boolean {
  const a = (staffName ?? "").trim().toLowerCase();
  const b = (tutorName ?? "").trim().toLowerCase();
  if (!a || !b) return false;
  return a !== b;
}

/**
 * Tutor accounts sharing one tutor record, by tutor id.
 *
 * Two people pointed at the same tutor both see that tutor's lessons and pay,
 * and one of them is being shown a colleague's money. Worth naming on the Staff
 * page rather than leaving to be discovered.
 */
export function sharedTutorLinks(
  staff: Array<{ user_id: string; role: string; tutor_id?: string | null }>,
): Set<string> {
  const count = new Map<string, number>();
  for (const s of staff) {
    if (s.role !== "tutor" || !s.tutor_id) continue;
    count.set(s.tutor_id, (count.get(s.tutor_id) ?? 0) + 1);
  }
  return new Set([...count.entries()].filter(([, n]) => n > 1).map(([id]) => id));
}
