import { fetchPaySheet, PaySheetError } from "./paySheet.controller.js";
import { registerScope } from "../dailyRegister/registerScope.js";
import EmployeeProfile from "../employee/models/EmployeeProfile.js";

// Employees page > Payroll history: what one employee was actually paid each
// month, from Pay Sheet 1 (BC365, through the Pay Sheet app). A Pay Sheet row's
// "initials" (BC Initials No.) is the employee's Matrix ID: the profile's
// Initials No., or its employee code when that is empty.

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_MONTHS = 24;
const round = (n) => Math.round(n * 100) / 100;

// The amounts kept per month; WAGES and SALARY rows of one month are added up.
const AMOUNTS = [
  "totalEarnings",
  "pfEmployee",
  "esiEmployee",
  "professionalTax",
  "tdsOnSalary",
  "totalDeductions",
  "netAmount"
];

function monthRange(month) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [`${month}-01`, `${month}-${String(last).padStart(2, "0")}`];
}

// GET /api/paysheets/employee/:employeeId?months=2026-09,2026-10
// -> { matrixId, months: [{ month: "2026-10", salaryTypes: ["WAGES"], totalEarnings, pfEmployee,
//      esiEmployee, professionalTax, tdsOnSalary, totalDeductions, netAmount }] }
// A month with no Pay Sheet row for the employee is left out.
async function getEmployeePay(req, res) {
  try {
    const employee = await EmployeeProfile.findOne(
      { employeeId: req.params.employeeId },
      { employeeId: 1, initialsNo: 1, department: 1 }
    ).lean();
    if (!employee) return res.status(404).json({ message: "Employee not found" });

    const matrixId = String(employee.initialsNo || employee.employeeId).trim();

    // Users limited to some Daily Register departments see only those employees.
    const scope = await registerScope(req);
    if (scope && !scope.ids.includes(matrixId) && !scope.ids.includes(String(employee.employeeId))) {
      return res.status(403).json({ message: "This employee is outside your department" });
    }

    const months = [...new Set(String(req.query.months || "").split(","))].filter((m) => MONTH.test(m));
    if (!months.length) return res.status(400).json({ message: "months=YYYY-MM,... is required" });
    if (months.length > MAX_MONTHS) return res.status(400).json({ message: `At most ${MAX_MONTHS} months` });

    // One month at a time, as the Pay Sheet pages ask (and so share their cache).
    const result = [];
    for (const month of months) {
      const [from, to] = monthRange(month);
      const rows = await fetchPaySheet(1, from, to);
      const mine = (Array.isArray(rows) ? rows : []).filter((row) => String(row.initials ?? "").trim() === matrixId);
      if (!mine.length) continue;
      const entry = { month, salaryTypes: [...new Set(mine.map((row) => row.salaryType).filter(Boolean))] };
      for (const key of AMOUNTS) entry[key] = round(mine.reduce((sum, row) => sum + (Number(row[key]) || 0), 0));
      result.push(entry);
    }

    res.json({ matrixId, months: result });
  } catch (error) {
    res.status(error instanceof PaySheetError ? 502 : 500).json({ message: error.message });
  }
}

export { getEmployeePay };
