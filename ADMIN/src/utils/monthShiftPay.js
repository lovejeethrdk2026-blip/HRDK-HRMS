// Month Shift Register & Pay: each employee's month, day by day, measured
// against their shift (Daily Register rows), and pay worked out from the
// monthly CTC on the employee master. Calculation only -- nothing is saved.
//
// Rules (per day, only days the employee was on the rolls, up to yesterday):
// - Worked time = completed IN->OUT pairs (totalWorking), the same figure the
//   Daily Register shows. Full day = shift length less lunch (fullDaySeconds).
// - Worked >= fullShare of the full day  -> P  (1 day)
//   Worked >= halfShare of the full day  -> HD (0.5 day)
//   Less (or no punch)                   -> A  (0 day)
// - Approved leave (Leave page) is paid: full leave 1 day, half leave 0.5 day
//   plus whatever the worked half earns (a day is never more than 1).
// - Weekly off (master "Weekly off", Sunday when blank) with no work is paid
//   (WO, 1 day). Work done on a weekly off earns its P / HD value on top of the
//   paid weekly off ("WO worked").
// - Over time = worked time beyond the full day, on days with any work.
// - Pay: per-day rate = monthly CTC / days in month; earned CTC = per-day rate
//   x paid days. Hourly rate = per-day rate / full-day hours (for OT pay).
//   CTC is the one on the month's last day (pay history), from Add Employee.

import { totalWorking, fullDaySeconds, lateSeconds, earlyOutSeconds } from "./attendanceStats";
import { employeeOn, isWorkingOn } from "@salary";

const WEEK_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const pad = (n) => String(n).padStart(2, "0");
const round2 = (n) => Math.round(n * 100) / 100;

// Today as YYYYMMDD on this computer's clock.
function todayNumber() {
  const now = new Date();
  return Number(`${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`);
}

// One day's result for one employee.
function dayResult({ row, shift, weeklyOff, dayName, fullShare, halfShare }) {
  // The master's shift wins; the register row's shift is the fallback.
  const doc = row ? { ...row, shift: shift || row.shift } : { shift };
  const fullDay = fullDaySeconds(doc);
  const worked = row ? totalWorking(doc).seconds : 0;

  let workValue = 0;
  if (worked > 0 && worked >= fullDay * fullShare) workValue = 1;
  else if (worked > 0 && worked >= fullDay * halfShare) workValue = 0.5;

  const leave = row?.leave || null;
  const isWeeklyOff = dayName === weeklyOff;
  const late = row && worked > 0 ? lateSeconds(doc) || 0 : 0;
  const earlyOut = row && worked > 0 ? earlyOutSeconds(doc) || 0 : 0;
  const overtime = worked > fullDay ? worked - fullDay : 0;
  const short = worked > 0 && worked < fullDay ? fullDay - worked : 0;

  let code;
  let paid;
  let leaveDays = 0;
  let woWorked = 0;
  if (isWeeklyOff) {
    paid = 1 + workValue;
    woWorked = workValue;
    code = workValue ? (workValue === 1 ? "WO+P" : "WO+HD") : "WO";
  } else if (leave) {
    leaveDays = leave.half ? 0.5 : 1;
    paid = Math.min(1, leaveDays + workValue);
    code = leave.half ? (workValue ? `HD+${leave.type}½` : `${leave.type}½`) : leave.type || "L";
  } else {
    paid = workValue;
    code = workValue === 1 ? "P" : workValue === 0.5 ? "HD" : "A";
  }

  return { code, paid, workValue, leaveDays, woWorked, isWeeklyOff, worked, fullDay, late, earlyOut, overtime, short };
}

// rows: Daily Register rows for the month (GET /attendance?view=register).
// employees: GET /employees (EmployeeProfile documents).
// month: "YYYY-MM". options: { fullShare, halfShare } as fractions (0.75, 0.5).
export function monthShiftPay({ rows, employees, month, fullShare = 0.75, halfShare = 0.5 }) {
  const [yyyy, mm] = month.split("-");
  const year = Number(yyyy);
  const monthNo = Number(mm);
  const daysInMonth = new Date(Date.UTC(year, monthNo, 0)).getUTCDate();
  const lastDayIso = `${yyyy}-${mm}-${pad(daysInMonth)}`;
  const today = todayNumber();

  // "ID|DD-MM-YYYY" -> register row
  const byDay = new Map();
  for (const row of rows) byDay.set(`${row.ID}|${row.Date}`, row);

  const result = [];
  for (const employee of employees) {
    // Register rows carry the COSEC ID: the master's "Initials No." (initialsNo),
    // or the employee code itself when that is the COSEC ID.
    const id = String(employee.initialsNo ?? "").trim() || String(employee.employeeId);
    const weeklyOff = employee.weeklyOff || "Sunday";
    const shift = employee.shift?.in && employee.shift?.out ? employee.shift : null;
    const pay = employeeOn(employee, lastDayIso);
    const monthlyCtc = Number(pay.monthlyCtc) || 0;

    const days = [];
    let counted = 0;
    const totals = {
      present: 0, halfDays: 0, absent: 0, weeklyOffs: 0, woWorked: 0, leaveDays: 0, paidDays: 0,
      workedSeconds: 0, shiftSeconds: 0, overtimeSeconds: 0, shortSeconds: 0, lateDays: 0, lateSeconds: 0, earlyOutDays: 0
    };

    for (let d = 1; d <= daysInMonth; d++) {
      const display = `${pad(d)}-${mm}-${yyyy}`;
      const iso = `${yyyy}-${mm}-${pad(d)}`;
      const dayName = WEEK_DAYS[new Date(Date.UTC(year, monthNo - 1, d)).getUTCDay()];
      // Today is still running: counted from tomorrow on.
      if (Number(`${yyyy}${mm}${pad(d)}`) >= today) {
        days.push({ day: d, dayName, code: "", future: true });
        continue;
      }
      if (!isWorkingOn(employee, iso)) {
        days.push({ day: d, dayName, code: "–", offRolls: true });
        continue;
      }
      counted++;
      const r = dayResult({ row: byDay.get(`${id}|${display}`), shift, weeklyOff, dayName, fullShare, halfShare });
      days.push({ day: d, dayName, ...r });

      totals.paidDays += r.paid;
      totals.leaveDays += r.leaveDays;
      totals.woWorked += r.woWorked;
      if (r.isWeeklyOff) totals.weeklyOffs++;
      else if (!r.leaveDays || r.leaveDays < 1) {
        if (r.workValue === 1) totals.present++;
        else if (r.workValue === 0.5) totals.halfDays++;
        else if (!r.leaveDays) totals.absent++;
      }
      if (!r.isWeeklyOff && r.leaveDays < 1) totals.shiftSeconds += r.leaveDays ? r.fullDay / 2 : r.fullDay;
      totals.workedSeconds += r.worked;
      totals.overtimeSeconds += r.overtime;
      totals.shortSeconds += r.short;
      if (r.late) {
        totals.lateDays++;
        totals.lateSeconds += r.late;
      }
      if (r.earlyOut) totals.earlyOutDays++;
    }
    if (!counted) continue; // not on the rolls in the days counted so far

    const fullDayHours = fullDaySeconds({ shift }) / 3600 || 8;
    const perDay = monthlyCtc / daysInMonth;
    const perHour = perDay / fullDayHours;
    const earned = perDay * totals.paidDays;
    const otPay = perHour * (totals.overtimeSeconds / 3600);

    result.push({
      employeeId: employee.employeeId,
      cosecId: id,
      name: employee.name || "",
      department: pay.department || employee.department || "",
      salaryType: employee.salaryType || "",
      shift: shift ? `${shift.in}–${shift.out}` : "",
      // A shift over 14 hours is most likely an AM/PM slip on the master
      // (10:00–07:00 typed for 10:00–19:00): the page flags it.
      shiftSuspect: Boolean(shift) && fullDayHours > 14,
      weeklyOff,
      fullDayHours: round2(fullDayHours),
      monthlyCtc,
      daysCounted: counted,
      ...totals,
      paidDays: round2(totals.paidDays),
      perDay: round2(perDay),
      perHour: round2(perHour),
      earned: Math.round(earned),
      otPay: Math.round(otPay),
      days
    });
  }

  result.sort((a, b) => String(a.employeeId).localeCompare(String(b.employeeId), undefined, { numeric: true }));
  return { daysInMonth, rows: result };
}
