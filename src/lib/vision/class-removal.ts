/**
 * Undoing a class, and the difference between cancelling one and deleting it.
 *
 * The class builder makes a term of lessons in one press, and a mistake in it
 * makes a term of wrong lessons in one press. Until now the only answer was to
 * set the class to Cancelled - which changed a word on the Classes screen and
 * left every generated lesson sitting on the timetable, because nothing
 * cascaded from the class to its own lessons. So the mistake stayed visible,
 * and there was no way at all to take it back.
 *
 * Two operations, and they are not the same thing:
 *
 *   CANCELLING says the class is not running. It is the honest answer for a
 *     class that existed and stopped - the history stays, the past lessons stay
 *     marked, and the hours already taught stay billed. Lessons still to come
 *     are cancelled with it.
 *
 *   DELETING says the class never should have existed. It removes the class,
 *     its lessons, its enrolments and its roll entirely. That is only ever
 *     right while nothing real has happened yet, which is what the refusals
 *     below are for.
 *
 * The rules are pure so they can be tested without a database, and so the
 * dialog that warns and the handler that acts cannot disagree about what is
 * about to happen.
 */

export interface ClassRemovalFacts {
  /** Lessons generated for this class. */
  lessons: number;
  /** Students enrolled in it, closed enrolments included. */
  enrolments: number;
  /** Roll entries across all its lessons. */
  rollEntries: number;
  /** Lessons actually taught: someone marked present and hours were spent. */
  taughtLessons: number;
  /** Charges raised against any of its lessons. */
  charges: number;
}

/**
 * Why this class cannot be deleted, or null when it can.
 *
 * Both refusals are somebody else's record rather than a rule of taste, and
 * both point at cancelling instead - which is the operation that fits a class
 * that genuinely ran.
 */
export function classRemovalRefusal(facts: ClassRemovalFacts): string | null {
  if (facts.charges > 0) {
    return (
      "Lessons in this class have been charged. Deleting it would leave those bills " +
      "describing something that no longer exists. Cancel the class instead, which " +
      "stops it running and keeps the record."
    );
  }
  if (facts.taughtLessons > 0) {
    return (
      `${facts.taughtLessons} ${facts.taughtLessons === 1 ? "lesson has" : "lessons have"} ` +
      "already been taught and marked. That is history, not a mistake - cancel the class " +
      "instead, which stops the rest of the term without erasing what happened."
    );
  }
  return null;
}

/**
 * What deleting it will take with it, said before it happens.
 *
 * Only the counts that are not zero: a list that recites every possibility on
 * every class teaches people to click through it.
 */
export function classRemovalConsequences(facts: ClassRemovalFacts): string[] {
  const out: string[] = [];
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  if (facts.lessons > 0) {
    out.push(`${plural(facts.lessons, "lesson", "lessons")} disappear from the timetable.`);
  }
  if (facts.enrolments > 0) {
    out.push(
      `${plural(facts.enrolments, "enrolment", "enrolments")} on this class go, and the students ` +
        "come off it. The students themselves are untouched.",
    );
  }
  if (facts.rollEntries > 0) {
    out.push(`${plural(facts.rollEntries, "roll entry", "roll entries")} go with those lessons.`);
  }

  // Hours are the student's money, not the class's, so they are never taken by
  // this - and someone deleting a class they just built needs to know the
  // package they bought in the same breath is still sitting there.
  out.push(
    "Any hours package bought for these students stays on their record - remove it from " +
      "Enrolments & Hours if it was part of the same mistake.",
  );
  out.push("This cannot be undone. Rebuild the class from the Class Builder if you need it back.");
  return out;
}
