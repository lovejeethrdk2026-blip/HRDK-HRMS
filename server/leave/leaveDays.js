import { LeaveApplication } from "./models/Leave.js";

// Day-by-day view of leave: which dates an application covers, and the
// approved leave the Daily Register shows on each employee's day.

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export const isIsoDate = (value) => ISO.test(String(value ?? "")) && !Number.isNaN(Date.parse(value));

// "YYYY-MM-DD" -> "DD-MM-YYYY" (the Daily Register's Date)
export const toDisplayDate = (iso) => iso.split("-").reverse().join("-");

// Financial year of a "YYYY-MM-DD" date: 2026 = April 2026 .. March 2027.
export function fyOf(iso) {
  const [y, m] = iso.split("-").map(Number);
  return m >= 4 ? y : y - 1;
}

// Every working day an application covers: [{ date: "YYYY-MM-DD", value }],
// Sundays (the weekly off) left out; value 0.5 for a half day, else 1.
export function leaveDays({ fromDate, toDate, halfDay }) {
  const days = [];
  const end = new Date(`${toDate}T00:00:00Z`);
  for (let d = new Date(`${fromDate}T00:00:00Z`); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() === 0) continue;
    days.push({ date: d.toISOString().slice(0, 10), value: halfDay ? 0.5 : 1 });
  }
  return days;
}

// ---------- approved leave for the Daily Register ----------

const CACHE_MS = 60 * 1000;
let cache = null; // { at, byDay: Map("ID|DD-MM-YYYY" -> { type, half }) }
let loading = null;

function load() {
  loading ??= LeaveApplication.find(
    { status: "Approved" },
    { _id: 0, employeeId: 1, type: 1, fromDate: 1, toDate: 1, halfDay: 1 }
  )
    .lean()
    .then((rows) => {
      const byDay = new Map();
      for (const row of rows) {
        for (const { date } of leaveDays(row)) {
          byDay.set(`${row.employeeId}|${toDisplayDate(date)}`, { type: row.type, half: Boolean(row.halfDay) });
        }
      }
      cache = { at: Date.now(), byDay };
      return byDay;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

// Map("employeeId|DD-MM-YYYY" -> { type: "CL", half: false }) of approved leave days.
export async function approvedLeaveDays() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.byDay;
  return load();
}

// After an application is approved, cancelled or changed.
export function clearLeaveCache() {
  cache = null;
}
