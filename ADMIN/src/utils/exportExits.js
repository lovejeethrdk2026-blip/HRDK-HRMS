import * as XLSX from "xlsx";
import { employeeOn, sortableDate } from "@salary";

// Employees page > Download exit report: one row per time someone left
// (employee.exits), newest last working day first, with where they worked and
// their CTC on that day, and the rejoin date if they came back.

const yesNo = (value) => (value == null ? "" : value ? "Yes" : "No");

// Downloads the Exits sheet. Returns how many rows it got (0: no file).
export function exportExitsToExcel(employees) {
  const rows = [];
  for (const employee of employees) {
    for (const exit of employee.exits || []) {
      const on = employeeOn(employee, exit.lastWorkingDay);
      rows.push({
        day: sortableDate(exit.lastWorkingDay),
        cells: [
          employee.employeeId,
          employee.name,
          on.department,
          on.subDepartment,
          on.designation,
          on.state,
          employee.joiningDate,
          exit.resignationDate,
          exit.lastWorkingDay,
          exit.exitType,
          exit.reason,
          exit.noticeServed,
          yesNo(exit.rehireEligible),
          on.monthlyCtc ?? "",
          exit.rejoinDate,
          [exit.remark, exit.rejoinRemark].filter(Boolean).join(" · ")
        ]
      });
    }
  }
  if (!rows.length) return 0;
  rows.sort((a, b) => b.day.localeCompare(a.day));

  const header = [
    "Employee code",
    "Name",
    "Department",
    "Sub department",
    "Designation",
    "State",
    "Date of joining",
    "Resignation date",
    "Last working day",
    "Exit type",
    "Reason",
    "Notice served",
    "Rehire eligible",
    "Monthly CTC on leaving",
    "Rejoined on",
    "Remark"
  ];
  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows.map((row) => row.cells)]);
  sheet["!cols"] = [12, 22, 18, 18, 18, 14, 13, 14, 14, 13, 30, 12, 12, 14, 12, 30].map((wch) => ({ wch }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Exits");
  XLSX.writeFile(workbook, `exit-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
  return rows.length;
}
