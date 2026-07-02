/**
 * HGV rest-day safety rule — shared between the API server (enforcement) and
 * the grid UI (display + confirmation). This is the SINGLE source of truth for
 * the thresholds; change the two numbers in `REST_DAY_RULES` to tune behaviour.
 *
 * The rule applies to HGV workers only. Warehouse workers have no limit and no
 * consecutive-day counter.
 */

export interface RestDayRules {
  /** Reaching this many consecutive working days triggers a WARNING (still allowed, with confirmation). */
  warnAt: number;
  /** Reaching this many consecutive working days is BLOCKED (cannot be saved). */
  blockAt: number;
}

/**
 * The two thresholds. Edit these — and only these — to change when the grid
 * warns versus blocks. Default: warn at 6 consecutive working days, block at 7.
 */
export const REST_DAY_RULES: RestDayRules = {
  warnAt: 6,
  blockAt: 7,
};

/** A day only counts toward a consecutive-working streak with one of these statuses. */
export const WORKING_STATUSES = ["Confirmed", "Pre-Booked"] as const;
export type WorkingStatus = (typeof WORKING_STATUSES)[number];

const WORKING_SET: ReadonlySet<string> = new Set(WORKING_STATUSES);

/** True when a booking status counts as a worked day (Confirmed or Pre-Booked). */
export function isWorkingStatus(status: string | null | undefined): boolean {
  return status != null && WORKING_SET.has(status);
}

/**
 * The job roles that count as "HGV-type" for the rest-day rule. The rule keys
 * off the worker's JOB ROLE (not their worker_type or the sheet type) so it
 * applies to these roles wherever they appear — including on a "Both" sheet —
 * and never to Van / Forklift / Drivers Mate / Warehouse / Other.
 */
export const REST_RULE_JOB_ROLES = ["HGV 1", "HGV 2", "Trunker", "Coach"] as const;
export type RestRuleJobRole = (typeof REST_RULE_JOB_ROLES)[number];

const REST_RULE_JOB_ROLE_SET: ReadonlySet<string> = new Set(REST_RULE_JOB_ROLES);

/** Only workers in an HGV-type job role are subject to the rest-day rule. */
export function isRestRuleJobRole(
  jobRole: string | null | undefined,
): boolean {
  return jobRole != null && REST_RULE_JOB_ROLE_SET.has(jobRole);
}

/** Map of ISO date (`YYYY-MM-DD`) -> booking status for a single worker. */
export type StatusByDate = Record<string, string | null | undefined>;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Add (or subtract, with a negative delta) whole days to an ISO `YYYY-MM-DD`
 * date and return an ISO date. UTC-based so it never drifts across DST.
 */
export function addDays(isoDate: string, delta: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + delta * MS_PER_DAY);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Consecutive working days ending ON `date` (inclusive), counting backwards
 * until a non-working day (Rest/Off/Holiday/Available/empty) breaks the streak.
 * Returns 0 if `date` itself is not a working day. This is the
 * "days worked since last rest" number shown on the grid.
 */
export function consecutiveWorkingDaysEndingOn(
  statusByDate: StatusByDate,
  date: string,
): number {
  if (!isWorkingStatus(statusByDate[date])) return 0;
  let count = 1;
  let cursor = addDays(date, -1);
  while (isWorkingStatus(statusByDate[cursor])) {
    count++;
    cursor = addDays(cursor, -1);
  }
  return count;
}

/**
 * Total length of the consecutive working-day run that would contain `date`
 * if `date` were set to `statusAtDate`. Extends both backwards and forwards so
 * that filling a gap between two existing streaks is counted correctly.
 * Returns 0 if `statusAtDate` is not a working status.
 */
export function consecutiveRunLengthWith(
  statusByDate: StatusByDate,
  date: string,
  statusAtDate: string,
): number {
  if (!isWorkingStatus(statusAtDate)) return 0;
  let count = 1;
  let back = addDays(date, -1);
  while (isWorkingStatus(statusByDate[back])) {
    count++;
    back = addDays(back, -1);
  }
  let fwd = addDays(date, 1);
  while (isWorkingStatus(statusByDate[fwd])) {
    count++;
    fwd = addDays(fwd, 1);
  }
  return count;
}

export type RestDecision = "ok" | "warn" | "block";

/** Classify a would-be consecutive-day count against the thresholds. */
export function classifyRestDecision(
  consecutiveDays: number,
  rules: RestDayRules = REST_DAY_RULES,
): RestDecision {
  if (consecutiveDays >= rules.blockAt) return "block";
  if (consecutiveDays >= rules.warnAt) return "warn";
  return "ok";
}

/** The most consecutive working days that can be saved (with confirmation). */
export function maxAllowedConsecutiveDays(
  rules: RestDayRules = REST_DAY_RULES,
): number {
  return rules.blockAt - 1;
}
