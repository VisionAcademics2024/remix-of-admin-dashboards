/**
 * Taking a student off one lesson's roll.
 *
 * The Sessions screen lists roll entries - one per student per lesson - and
 * this is what happens when one is removed. The distinction that matters, and
 * the one that is easy to get wrong: the entry goes, the lesson stays. The
 * class keeps running, the lesson keeps its time and its tutor, every other
 * student on it is untouched. Only this student's name comes off this roll.
 *
 * That makes it the exact inverse of the class builder, which puts a student
 * onto chosen lessons. Remove them here, add them back there.
 *
 * Two things make a roll entry un-removable, and both are somebody else's
 * record rather than a rule of taste:
 *
 *   a charge points at it - the money has been asked for, and deleting the
 *     lesson it was raised against would leave an invoice line describing
 *     something the system no longer has (the foreign key says RESTRICT, so
 *     the database refuses too; this refuses first, with a sentence);
 *   a make-up settles it - the make-up row carries source_attendance_id, and
 *     `make_up_has_source` will not let that be null, so removing the absence
 *     would break the make-up that answers it.
 *
 * Everything else is allowed and merely has consequences worth stating before
 * the fact, which is what `removalConsequences` is for.
 */

export interface RollEntryFacts {
  /** Charges referencing this entry that have not been cancelled. */
  charges: number;
  /** Make-up lessons booked to settle this absence. */
  makeUpsSettlingIt: number;
  /** Hours this entry drew - handed back to the package if it goes. */
  hoursConsumed: number;
  /** The package those hours came out of, if any. */
  packageId: string | null;
  /** Whether the roll was marked at all. */
  status: string | null;
}

/**
 * Why this entry cannot be removed, or null when it can.
 *
 * One sentence, aimed at the person about to click the button, naming what is
 * in the way and what to do about it first.
 */
export function removalRefusal(facts: RollEntryFacts): string | null {
  if (facts.charges > 0) {
    return (
      "This lesson has already been charged. Cancel the charge in Billing first - " +
      "removing the roll entry would leave the bill pointing at a lesson that no longer exists."
    );
  }
  if (facts.makeUpsSettlingIt > 0) {
    return (
      "A make-up lesson was booked to settle this absence, and it records this entry as the " +
      "absence it answers. Deal with the make-up first, then remove this."
    );
  }
  return null;
}

/**
 * What removing it will change, said before it happens.
 *
 * Only the consequences that are real for this particular entry. A list that
 * recites every possibility on every row teaches people to click through it.
 */
export function removalConsequences(facts: RollEntryFacts): string[] {
  const out: string[] = [];

  if (facts.hoursConsumed > 0 && facts.packageId) {
    out.push(
      `${round2(facts.hoursConsumed)} h goes back onto their hours package - the balance rises by that much.`,
    );
  } else if (facts.hoursConsumed > 0) {
    out.push(
      `${round2(facts.hoursConsumed)} h stops counting as taught, so it drops out of what is owed.`,
    );
  }

  if (facts.status === "present") {
    out.push("The record that they attended this lesson is gone. It is not kept anywhere else.");
  }

  out.push("The lesson itself, its tutor and everyone else on the roll are untouched.");
  out.push("Add them back from the class builder if this was a mistake.");
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
