import EmployeeProfile from "../employee/models/EmployeeProfile.js";

// Each employee's shift from Add Employee > Employee shift ({ in, out } as
// "HH:mm"), used by the Daily Register: a shift whose Out is earlier than its
// In (e.g. 20:00 -> 03:00) crosses midnight, so that employee's punches are
// grouped as a night shift (nightShift.js) without ticking them by hand.
// Read once and kept for CACHE_MS, so a register page costs no extra Atlas read;
// a shift changed on the Employees page shows within that time.

const CACHE_MS = 60 * 1000;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

let cache = null; // { at, shifts: Map(employeeId -> { in, out }) }
let loading = null;

function load() {
  loading ??= EmployeeProfile.find(
    { "shift.in": { $nin: ["", null] }, "shift.out": { $nin: ["", null] } },
    { _id: 0, employeeId: 1, shift: 1 }
  )
    .lean()
    .then((rows) => {
      const shifts = new Map();
      for (const row of rows) {
        const { in: start, out: end } = row.shift || {};
        if (TIME.test(start) && TIME.test(end) && start !== end) {
          shifts.set(String(row.employeeId), { in: start, out: end });
        }
      }
      cache = { at: Date.now(), shifts };
      return shifts;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

// Map(employeeId -> { in: "HH:mm", out: "HH:mm" }) of employees with a full shift.
export async function employeeShifts() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.shifts;
  if (cache) {
    load().catch(() => {});
    return cache.shifts;
  }
  return load();
}

// Drop the cached shifts (after an employee's shift is saved).
export function clearShiftCache() {
  cache = null;
}

// True when the shift runs past midnight (Out earlier than In).
export function crossesMidnight(shift) {
  return Boolean(shift && shift.out < shift.in);
}

// "HH:mm" -> minutes since midnight
const minutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

// Where one shift's day ends and the next begins, as "HH:mm:ss": halfway
// through the time off between Out and In. 20:00 -> 03:00 gives 11:30, so a
// 03:00 OUT joins the shift that began the evening before and a 19:55 IN
// starts a new one. null for a shift that does not cross midnight.
export function shiftCutoff(shift) {
  if (!crossesMidnight(shift)) return null;
  const mid = Math.round((minutes(shift.out) + minutes(shift.in)) / 2);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(Math.floor(mid / 60))}:${pad(mid % 60)}:00`;
}
