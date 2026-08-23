/**
 * Mock adapter — tests and isolated previews only.
 *
 * This checkpoint ships the skeleton: the same interface as the live adapter,
 * the shared mock clock, and an explicit refusal for reads whose fixtures do
 * not exist yet, so a half-mocked screen fails loudly instead of rendering
 * plausible nonsense. Fixtures land in the fixtures checkpoint.
 */
import type { VisionRepository } from "../repository";
import { mockToday } from "./clock";

export { mockToday, setMockToday, shiftDays, sydneyDate } from "./clock";

function pending(read: string): never {
  throw new Error(
    `Mock data for "${read}" has not been built yet. Mock mode is for tests and isolated previews; switch VITE_DATA_MODE back to "supabase" for real data.`,
  );
}

export const mockRepository: VisionRepository = {
  mode: "mock",

  getStudentDirectory: async () => pending("getStudentDirectory"),
  getGuardianDirectory: async () => pending("getGuardianDirectory"),
  getTutorDirectory: async () => pending("getTutorDirectory"),
  getStudentDetail: async () => pending("getStudentDetail"),

  getTodayBoard: async (date = mockToday()) => pending(`getTodayBoard(${date})`),
  getTodaySessions: async (date = mockToday()) => pending(`getTodaySessions(${date})`),
  getWeekSessions: async () => pending("getWeekSessions"),
  getSessionRoll: async () => pending("getSessionRoll"),

  getOfferingList: async () => pending("getOfferingList"),
  getOfferingDetail: async () => pending("getOfferingDetail"),

  getAttendanceQueue: async () => pending("getAttendanceQueue"),
  getMakeupQueue: async () => pending("getMakeupQueue"),

  getCommerceBoard: async () => pending("getCommerceBoard"),
  getChargeWorkQueue: async () => pending("getChargeWorkQueue"),

  getTutorPay: async () => pending("getTutorPay"),

  getCatalogue: async () => pending("getCatalogue"),
  getNeedsAttention: async () => pending("getNeedsAttention"),
  getNeedsAttentionCount: async () => ({ count: 0 }),

  getMe: async () => pending("getMe"),
  getStaffList: async () => pending("getStaffList"),
};
