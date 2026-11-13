import { XLSX, loadXlsx } from "./xlsx";
import api from "../api/axios";

// Employees page > Download salary sheet: one row per employee on the rolls in
// the month, with bank details and the in-hand pay cut to the days paid, as
// worked out by GET /api/employees/salary-sheet (server/employee/salarySheet.js).

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// month "YYYY-MM". Returns how many rows the file got (0: no file).
export async function exportSalarySheet(month) {
  await loadXlsx();
  const { data } = await api.get("/employees/salary-sheet", { params: { month } });
  const rows = data.rows || [];
  if (!rows.length) return 0;

  const [yyyy, mm] = month.split("-");
  const label = `${MONTHS[Number(mm) - 1]} ${yyyy}`;
  const header = [
    "Emp ID",
    "Name",
    "Bank account no.",
    "IFSC code",
    "Bank name",
    "Department",
    "Days present",
    "Weekly offs (paid)",
    "Days absent",
    "Paid days (of 30)",
    "Monthly in-hand",
    "Salary"
  ];
  const body = rows.map((row) => [
    row.employeeId,
    row.name,
    row.accountNo,
    row.ifscCode,
    row.bankName,
    row.department,
    row.present,
    row.weeklyOffs,
    row.absent,
    row.paidDays,
    row.monthlyInHand,
    row.salary
  ]);
  const total = rows.reduce((sum, row) => sum + row.salary, 0);
  body.push(["", "Total", "", "", "", "", "", "", "", "", "", total]);

  const sheet = XLSX.utils.aoa_to_sheet([[`Salary sheet · ${label}`], [], header, ...body]);
  // Account numbers as text, so Excel keeps every digit and leading zeros.
  for (let r = 0; r < rows.length; r++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: r + 3, c: 2 })];
    if (cell) {
      cell.t = "s";
      cell.v = String(cell.v);
    }
  }
  sheet["!cols"] = [10, 24, 20, 14, 16, 22, 12, 16, 12, 16, 16, 12].map((wch) => ({ wch }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Salary");
  XLSX.writeFile(workbook, `Salary_Sheet_${label.replace(" ", "_")}.xlsx`);
  return rows.length;
}
