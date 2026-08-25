/**
 * Live adapter - the default data path.
 *
 * Every method delegates to an existing server function in src/lib/vision.
 * Nothing here adds, changes or bypasses business logic; where a read shape is
 * missing from the backend it is recorded in docs/BACKEND-GAPS.md rather than
 * fixed here.
 */
import type { VisionRepository } from "../repository";
import type { DirectoryParams, SydneyDate, WeekParams } from "../types";

import { getBillingBoard } from "@/lib/vision/billing.functions";
import { getCatalogue } from "@/lib/vision/catalogue.functions";
import { getClassOffering, listClassOfferings } from "@/lib/vision/classes.functions";
import { listCommerce } from "@/lib/vision/commerce.functions";
import {
  getNeedsAttention,
  getNeedsAttentionCount,
  getToday,
} from "@/lib/vision/overview.functions";
import { getFortnightPay } from "@/lib/vision/pay.functions";
import { getStudentDetail, listGuardians, listStudents } from "@/lib/vision/people.functions";
import { listRoll } from "@/lib/vision/roll.functions";
import { getSessionRoll, listToday, listWeek } from "@/lib/vision/schedule.functions";
import { getMe, listStaff } from "@/lib/vision/session.functions";

/** Client-side narrowing only - the server owns filtering it already supports. */
function applyDirectoryFilter(rows: unknown[], params?: DirectoryParams) {
  if (!params) return rows;
  const search = params.search?.trim().toLowerCase();
  const status = params.status && params.status !== "all" ? params.status : null;

  return (rows as Record<string, unknown>[]).filter((row) => {
    if (status && row["status"] !== status) return false;
    if (!search) return true;
    const name = String(row["full_name"] ?? "").toLowerCase();
    const code = String(row["code"] ?? "").toLowerCase();
    const email = String(row["email"] ?? "").toLowerCase();
    return name.includes(search) || code.includes(search) || email.includes(search);
  });
}

export const liveRepository: VisionRepository = {
  mode: "live",

  async getStudentDirectory(params?: DirectoryParams) {
    return applyDirectoryFilter(await listStudents(), params);
  },
  async getGuardianDirectory(params?: DirectoryParams) {
    return applyDirectoryFilter(await listGuardians(), params);
  },
  async getTutorDirectory(params?: DirectoryParams) {
    const catalogue = await getCatalogue();
    return applyDirectoryFilter(catalogue.tutors ?? [], params);
  },
  getStudentDetail(id: string) {
    return getStudentDetail({ data: { id } });
  },

  getTodayBoard(date: SydneyDate) {
    return getToday({ data: { date } });
  },
  getTodaySessions(date: SydneyDate) {
    return listToday({ data: { date } });
  },
  getWeekSessions(params: WeekParams) {
    return listWeek({
      data: { week_start: params.weekStart, tutor_id: params.tutorId ?? null },
    });
  },
  getSessionRoll(sessionId: string) {
    return getSessionRoll({ data: { session_id: sessionId } });
  },

  getOfferingList() {
    return listClassOfferings();
  },
  getOfferingDetail(id: string) {
    return getClassOffering({ data: { id } });
  },

  getAttendanceQueue(filter: string, date: SydneyDate) {
    return listRoll({ data: { filter, date } });
  },
  getCommerceBoard() {
    return listCommerce();
  },
  getChargeWorkQueue() {
    return getBillingBoard();
  },

  getTutorPay(fortnightStart: SydneyDate) {
    return getFortnightPay({ data: { fortnight_start: fortnightStart } });
  },

  getCatalogue() {
    return getCatalogue();
  },
  getNeedsAttention() {
    return getNeedsAttention();
  },
  getNeedsAttentionCount() {
    return getNeedsAttentionCount();
  },

  getMe() {
    return getMe();
  },
  getStaffList() {
    return listStaff();
  },
};
