/**
 * Is this the server saying "sign in again", or the server being broken?
 *
 * The difference decides whether someone is sent to the login screen, and
 * getting it wrong is what makes a login screen impossible to get past.
 *
 * The authenticated layout loads `getMe` before any page. It used to treat
 * every failure of that call as a bad session and redirect to /auth. But /auth
 * has a guard of its own - it asks the auth server whether the token is valid,
 * and sends a valid one straight back to /today. So any failure that is NOT
 * about the token puts those two guards in a loop:
 *
 *   /today  -> getMe failed          -> go to /auth
 *   /auth   -> the token is fine     -> go to /today
 *   /today  -> getMe failed          -> go to /auth ...
 *
 * The browser shows that as a page that flickers and never settles, which
 * reads exactly like "I press sign in and it just refreshes". The session was
 * never the problem: a 500 from the server function, a dropped connection, a
 * database policy erroring, a missing environment variable on the server - any
 * of them produce it, and none of them are fixed by signing in again.
 *
 * So the failures are told apart. Every genuine auth refusal comes from one
 * place - `requireSupabaseAuth` - and every message it throws begins
 * "Unauthorized:". That prefix is the contract this reads, which is why it is
 * stated here with a test rather than pattern-matched inline at the call site.
 */

/** The prefix every refusal from requireSupabaseAuth carries. */
const AUTH_PREFIX = "unauthorized";

/**
 * True only when the server refused the token.
 *
 * Anything else - and anything unrecognisable - is treated as "not an auth
 * problem", because the cost of the two mistakes is not symmetrical. Calling a
 * broken server a login problem produces the loop above and hides the real
 * fault; calling a login problem a broken server shows an error page with the
 * reason on it, which is recoverable by reading it.
 */
export function isAuthFailure(error: unknown): boolean {
  const message = messageOf(error);
  if (!message) return false;
  return message.toLowerCase().includes(AUTH_PREFIX);
}

/**
 * The message inside whatever the server function threw.
 *
 * A server function error does not arrive as the Error that was thrown: it is
 * serialised across the boundary and can come back as an Error, as a plain
 * object carrying `message`, or as a string. All three are read, so the
 * discrimination does not depend on which shape the transport chose.
 */
function messageOf(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    if (typeof record["message"] === "string") return record["message"];
    // TanStack wraps a server function's failure with the body alongside it.
    const body = record["body"];
    if (typeof body === "string") return body;
    if (
      body &&
      typeof body === "object" &&
      typeof (body as Record<string, unknown>)["message"] === "string"
    ) {
      return (body as Record<string, string>)["message"]!;
    }
  }
  return "";
}
