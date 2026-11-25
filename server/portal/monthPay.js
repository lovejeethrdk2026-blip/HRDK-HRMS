import EmployeeProfile from "../employee/models/EmployeeProfile.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { isWorkingOn, resolvePayVersion, salaryForMonth } from "../utils/salaryFormulas.js";

// One employee's salary for a month, simply from Add Employee > Joining & pay:
// the full monthly split of that month's CTC (pay history), worked out with
// the employee's pay version. No punch / attendance (Matrix) days are used,
// and nothing comes from BC365. Used by the employee app (Salary tab,
// payslip, PDF) and the Employees panel's "Payroll history".

const pad = (n) => String(n).padStart(2, "0");
// Whole rupees on every line (HR asked: no paise on the payslip).
const rupee = (n) => Math.round(Number(n) || 0);

// Was the employee on the rolls any day of that month ("YYYY-MM")?
function onRollsIn(profile, month) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  for (let d = 1; d <= last; d++) if (isWorkingOn(profile, `${month}-${pad(d)}`)) return true;
  return false;
}

// month "YYYY-MM" -> { month, payVersion, monthlyCtc, earnings, deductions,
// totalEarnings, totalDeductions, net }, or null when not on the rolls or
// with no CTC that month.
export function payslipOf(profile, month) {
  if (!onRollsIn(profile, month)) return null;
  const [y, m] = month.split("-").map(Number);
  const split = salaryForMonth(profile, y, m);
  if (!(Number(split.monthlyCtc) > 0)) return null;
  const earnings = [
    ["Basic", split.basic],
    ["House rent allowance", split.hra],
    ["Special allowance", split.specialAllowance],
    ["Statutory bonus", split.statutoryBonus]
  ]
    .map(([label, amount]) => ({ label, amount: rupee(amount) }))
    .filter((r) => r.amount);
  const deductions = [
    ["PF", split.pfEmployee],
    ["ESIC", split.esicEmployee],
    ["Professional tax", split.professionalTax]
  ]
    .map(([label, amount]) => ({ label, amount: rupee(amount) }))
    .filter((r) => r.amount);
  const totalEarnings = rupee(earnings.reduce((s, r) => s + r.amount, 0));
  const totalDeductions = rupee(deductions.reduce((s, r) => s + r.amount, 0));
  return {
    month,
    source: "joining-pay",
    payVersion: resolvePayVersion(split.payVersion),
    monthlyCtc: Number(split.monthlyCtc),
    salaryTypes: profile.salaryType ? [String(profile.salaryType).toUpperCase()] : [],
    earnings,
    deductions,
    totalEarnings,
    totalDeductions,
    net: totalEarnings - totalDeductions
  };
}

// GET /api/employees/:employeeId/month-pay?months=2026-09,2026-10 -> { months:
// [{ month, payslip | null }] } (Employees panel > Payroll history). At most 36.
export const monthPayHistory = asyncHandler(async (req, res) => {
  const profile = await EmployeeProfile.findOne({ employeeId: req.params.employeeId }).lean();
  if (!profile) return res.status(404).json({ message: `Employee ${req.params.employeeId} not found` });
  const months = String(req.query.months || "")
    .split(",")
    .map((m) => m.trim())
    .filter((m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m))
    .slice(0, 36);
  res.json({ months: months.map((month) => ({ month, payslip: payslipOf(profile, month) })) });
});

// The finished months to list in the app (newest first): up to the last 12,
// from the joining month on. The running month is left out until it is over.
export function finishedMonths(profile, count = 12) {
  const now = new Date(Date.now() + 5.5 * 3600000); // India time
  const joined = String(profile?.joiningDate || "").split("-").reverse().join("-").slice(0, 7); // "YYYY-MM"
  const months = [];
  for (let i = 1; i <= count; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const month = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
    if (joined && month < joined) break;
    months.push(month);
  }
  return months;
}
