/**
 * Whose pay a request is allowed to be about.
 *
 * An owner asks about everybody's, so there is nothing to narrow. A tutor is
 * only ever asking about their own, and is narrowed to the tutor their account
 * teaches as.
 *
 * The third case is the one this exists for. A tutor account with no tutor
 * behind it cannot be answered - and the tempting answer, "no filter", is the
 * worst one available: it shows that tutor every colleague's lessons and pay.
 * So it throws. Failing loudly on a broken account is a smaller problem than
 * quietly widening the query, which is exactly the bug this replaced.
 */
export function payScope(staff: { role: string; tutor_id?: string | null }): string | null {
  if (staff.role !== "tutor") return null;
  if (!staff.tutor_id) {
    throw new Error(
      "This tutor account is not linked to a tutor, so its pay cannot be worked out. " +
        "An owner can link it on the Staff page.",
    );
  }
  return staff.tutor_id;
}
