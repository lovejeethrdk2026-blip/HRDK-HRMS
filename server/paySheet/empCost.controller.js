import { fetchPaySheetByMonth, scopePayRows, PaySheetError } from "./paySheet.controller.js";

// Pay Sheet > Emp Cost: one row per employee and salary type for a period,
// with gross, each deduction and in-hand. Amounts are Pay Sheet 1's (BC365)
// and nothing else is read: no employee master, no profiles.

const byText = (a, b) => a.localeCompare(b, undefined, { numeric: true });

// GET /api/paysheets/emp-cost?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD ->
// [{ employeeCode, employeeName, salaryType, grossSalary, providentFund,
//    professionalTax, esic, itDeduction, inHand }]
async function getEmpCost(req, res) {
  try {
    const rows = await scopePayRows(req, await fetchPaySheetByMonth(1, req.query.fromDate, req.query.toDate));

    const report = (Array.isArray(rows) ? rows : [])
      // BC365 rows with no employee ("(No employee dimension)") are postings,
      // not anyone's pay, so they stay out of a per-employee cost report.
      .filter((row) => String(row.initials ?? "").trim())
      .map((row) => ({
        employeeCode: String(row.initials ?? "").trim(),
        employeeName: String(row.employeeName ?? "").trim(),
        salaryType: row.salaryType || "",
        grossSalary: row.totalEarnings || 0,
        providentFund: row.pfEmployee || 0,
        professionalTax: row.professionalTax || 0,
        esic: row.esiEmployee || 0,
        itDeduction: row.tdsOnSalary || 0,
        inHand: row.netAmount || 0
      }))
      .sort((a, b) => byText(a.employeeName, b.employeeName) || byText(a.employeeCode, b.employeeCode));

    res.json(report);
  } catch (error) {
    res.status(error instanceof PaySheetError ? 502 : 500).json({ message: error.message });
  }
}

export { getEmpCost };
