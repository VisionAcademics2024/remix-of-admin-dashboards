/**
 * The one contract every screen reads through.
 *
 * Two adapters implement it: `live` (default — wraps the existing server
 * functions, which remain the only place business rules execute) and `mock`
 * (deterministic fixtures for tests and isolated previews). No route or
 * component talks to Supabase or to a `*.functions.ts` module directly.
 *
 * Rows are typed loosely for now (see ViewRows in ./types) and tightened into
 * named view models screen by screen.
 */
import type { DirectoryParams, MakeUpQueueState, SydneyDate, ViewRow, ViewRows, WeekParams } from "./types";

export interface VisionRepository {
  /** Which adapter is answering. Surfaced by the environment badge. */
  readonly mode: "live" | "mock";

  /* people */
  getStudentDirectory(params?: DirectoryParams): Promise<ViewRows>;
  getGuardianDirectory(params?: DirectoryParams): Promise<ViewRows>;
  getTutorDirectory(params?: DirectoryParams): Promise<ViewRows>;
  getStudentDetail(id: string): Promise<ViewRow>;

  /* schedule */
  getTodayBoard(date: SydneyDate): Promise<ViewRow>;
  getTodaySessions(date: SydneyDate): Promise<ViewRows>;
  getWeekSessions(params: WeekParams): Promise<ViewRow>;
  getSessionRoll(sessionId: string): Promise<ViewRow>;

  /* classes */
  getOfferingList(): Promise<ViewRows>;
  getOfferingDetail(id: string): Promise<ViewRow>;

  /* attendance and make-ups */
  getAttendanceQueue(filter: string, date: SydneyDate): Promise<ViewRows>;
  getMakeupQueue(state?: MakeUpQueueState): Promise<ViewRow>;

  /* commerce */
  getCommerceBoard(): Promise<ViewRow>;
  getChargeWorkQueue(): Promise<ViewRow>;

  /* pay — owner only; the server refuses for admins */
  getTutorPay(fortnightStart: SydneyDate): Promise<ViewRow>;

  /* configuration and exceptions */
  getCatalogue(): Promise<ViewRow>;
  getNeedsAttention(): Promise<ViewRows>;
  getNeedsAttentionCount(): Promise<{ count: number }>;

  /* session/staff */
  getMe(): Promise<ViewRow>;
  getStaffList(): Promise<ViewRow>;
}
