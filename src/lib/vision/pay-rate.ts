/**
 * Is this tutor's pay missing a rate, or is their rate genuinely nothing?
 *
 * The two look identical in a total - both come out $0.00 - and they mean
 * opposite things. No rate is an unfinished setup that somebody has to go and
 * fix. A rate of zero is a decision: the owners teach, and are not paid an
 * hourly wage for it, so their lessons are meant to total nothing.
 *
 * v_session_pay returns null for the first and 0 for the second, so the test
 * has to be `== null` rather than falsiness. Written as a named function
 * because `!rate` reads as correct and is not.
 */
export function rateIsMissing(lessons: { hourly_rate?: number | null }[]): boolean {
  return lessons.length > 0 && lessons.every((l) => l.hourly_rate == null);
}

/** The rate these lessons were paid at, or 0 if none of them carries one. */
export function rateOf(lessons: { hourly_rate?: number | null }[]): number {
  return Number(lessons.find((l) => l.hourly_rate != null)?.hourly_rate ?? 0);
}
