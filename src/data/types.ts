/**
 * Shared data-layer contracts: how a write reports back, and how screens ask
 * for a slice of data. No Supabase, no React, no page specifics.
 */
import type { Row } from "@/domain";

/* ------------------------------------------------------------------ results */

export interface ActionSuccess<T> {
  ok: true;
  data: T;
  /** Business language, states what changed. Shown to the user verbatim. */
  message: string;
  createdIds?: string[];
}

export interface ActionFailure {
  ok: false;
  /** Stable machine code, e.g. "no_eligible_allocation". */
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
  retryable: boolean;
}

export type ActionResult<T> = ActionSuccess<T> | ActionFailure;

/** Every record-creating job reports expected / created / skipped / failed. */
export type BatchResult<T> = ActionResult<T> & {
  expectedCount: number;
  createdCount: number;
  skippedCount: number;
  failures: { id: string; message: string }[];
};

export function ok<T>(data: T, message: string, createdIds?: string[]): ActionSuccess<T> {
  return createdIds ? { ok: true, data, message, createdIds } : { ok: true, data, message };
}

export function fail(
  code: string,
  message: string,
  options: { fieldErrors?: Record<string, string>; retryable?: boolean } = {},
): ActionFailure {
  return {
    ok: false,
    code,
    message,
    retryable: options.retryable ?? false,
    ...(options.fieldErrors ? { fieldErrors: options.fieldErrors } : {}),
  };
}

/** Normalises a thrown error from any adapter into a failure result. */
export function failFrom(error: unknown, fallback: string): ActionFailure {
  const message = error instanceof Error ? error.message : fallback;
  return fail("unexpected_error", message, { retryable: true });
}

/* ------------------------------------------------------------------- params */

/** A Sydney calendar date, `YYYY-MM-DD`. Never a raw timestamp. */
export type SydneyDate = string;

export interface DateRange {
  from: SydneyDate;
  to: SydneyDate;
}

export interface DirectoryParams {
  search?: string;
  status?: "active" | "inactive" | "all";
}

export interface WeekParams {
  weekStart: SydneyDate;
  tutorId?: string | null;
}

/**
 * Rows returned by the live adapter are PostgREST-shaped (embeds decided by
 * the query, not by the schema), so they are typed loosely at the boundary and
 * narrowed per screen. Tightening these into named view models happens
 * alongside each screen in later checkpoints.
 */
export type ViewRow = Row;
export type ViewRows = Row[];
