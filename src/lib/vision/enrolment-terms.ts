/**
 * What an enrolment update actually writes.
 *
 * saveEnrolment is used by two dialogs that send different fields: the one that
 * creates an enrolment names the package it draws from, and the one that
 * corrects its commercial terms does not mention the package at all.
 *
 * That difference is dangerous, because a straightforward spread would turn
 * "not mentioned" into "set to null" - and an enrolment with no default package
 * seeds every later roll entry against nothing, so the hours are taught, the
 * balance is never drawn down, and the student lands back in the billing audit
 * under "Hours taught against no package". The fix is small and the failure is
 * silent, which is exactly why it is stated here as a function with a test
 * rather than left as a line inside a handler.
 */

export interface EnrolmentTermsInput {
  ends_on?: string | null | undefined;
  method?: string | null | undefined;
  standard_price_id?: string | null | undefined;
  hours_override?: number | null | undefined;
  notes?: string | null | undefined;
  default_package_id?: string | null | undefined;
  [key: string]: unknown;
}

/**
 * Normalise the values a caller sent into the row to write.
 *
 * Empty strings become null, because a cleared input is an absent value rather
 * than an empty one. `default_package_id` is the exception to the spread: it is
 * carried over only when the caller actually sent it, so omitting the field
 * leaves the existing package alone and sending it - including as null, to
 * clear it deliberately - still writes.
 */
export function buildEnrolmentPayload(values: EnrolmentTermsInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    ...values,
    ends_on: values.ends_on || null,
    method: values.method || null,
    standard_price_id: values.standard_price_id || null,
    hours_override: values.hours_override ?? null,
    notes: values.notes || null,
  };

  if ("default_package_id" in values) {
    payload["default_package_id"] = values.default_package_id || null;
  } else {
    delete payload["default_package_id"];
  }

  return payload;
}
