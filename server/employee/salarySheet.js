import EmployeeProfile from "./models/EmployeeProfile.js";
import { monthRecords } from "../dailyRegister/attendanceCache.js";
import { registerScope, sameDepartment } from "../dailyRegister/registerScope.js";
import { isWorkingOn, salaryForMonth } from "../utils/salaryFormulas.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Employees page > Download salary sheet: each employee's in-hand pay for one
// month, cut to the days they were paid for, as read from the Daily Register.
//
// Rules:
// - Present: any punch (IN or OUT) on the day, matched by employee code = COSEC ID.
// - Weekly off (the card's Weekly off, Sunday when blank) is paid even with no punch.
// - Every month counts as 30 days: salary = in-hand / 30 * paid days, paid days
//   at most 30, and a month with every day paid (28-day February too) is 30.
// - Days before joining or after leaving are not paid.
// - In the current month only days up to today count.

const WEEK_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const PAIR_KEY = /^pair\d+$/;

const pad = (n) => String(n).padStart(2, "0");

// Has a day record any IN or OUT punch?
function punched(record) {
  return Object.keys(record).some((key) => PAIR_KEY.test(key) && (record[key]?.IN || record[key]?.OUT));
}

// Today as "YYYY-MM-DD" on this computer's clock.
function today() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// GET /api/employees/salary-sheet?month=YYYY-MM
async function salarySheet(req, res) {
  const month = String(req.query.month || "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return res.status(400).json({ message: "month must look like 2026-10" });
  }
  const [yyyy, mm] = month.split("-");
  const year = Number(yyyy);
  const monthNo = Number(mm);
  const daysInMonth = new Date(Date.UTC(year, monthNo, 0)).getUTCDate();
  const lastDay = today();

  // employeeId -> set of "DD-MM-YYYY" days with a punch
  const presentDays = new Map();
  for (const record of await monthRecords(mm, yyyy)) {
    if (!punched(record)) continue;
    const id = String(record.ID);
    if (!presentDays.has(id)) presentDays.set(id, new Set());
    presentDays.get(id).add(record.Date);
  }

  let employees = await EmployeeProfile.find().lean();
  const scope = await registerScope(req);
  if (scope) {
    const ids = new Set(scope.ids);
    employees = employees.filter(
      (employee) => ids.has(String(employee.employeeId)) || sameDepartment(employee.department, scope.department)
    );
  }

  const rows = [];
  for (const employee of employees) {
    const weeklyOff = employee.weeklyOff || "Sunday";
    const punches = presentDays.get(String(employee.employeeId)) || new Set();
    let onRolls = 0;
    let present = 0;
    let weeklyOffs = 0;
    let absent = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${yyyy}-${mm}-${pad(day)}`;
      if (iso > lastDay) break;
      if (!isWorkingOn(employee, iso)) continue;
      onRolls++;
      const dayName = WEEK_DAYS[new Date(Date.UTC(year, monthNo - 1, day)).getUTCDay()];
      if (punches.has(`${pad(day)}-${mm}-${yyyy}`)) present++;
      else if (dayName === weeklyOff) weeklyOffs++;
      else absent++;
    }
    if (!onRolls) continue; // not on the rolls this month

    const paid = present + weeklyOffs;
    const paidDays = paid >= daysInMonth ? 30 : Math.min(paid, 30);
    const split = salaryForMonth(employee, year, monthNo);
    const inHand = split.inHand ?? 0;

    rows.push({
      employeeId: employee.employeeId,
      name: employee.name,
      bankName: employee.bank?.bankName || "",
      accountNo: employee.bank?.accountNo || "",
      ifscCode: employee.bank?.ifscCode || "",
      department: split.department || employee.department || "",
      state: split.state || "",
      monthlyInHand: inHand,
      present,
      weeklyOffs,
      absent,
      paidDays,
      salary: Math.round((inHand / 30) * paidDays)
    });
  }

  rows.sort((a, b) => String(a.employeeId).localeCompare(String(b.employeeId), undefined, { numeric: true }));
  res.json({ month, daysInMonth, rows });
}

export const getSalarySheet = asyncHandler(salarySheet);
