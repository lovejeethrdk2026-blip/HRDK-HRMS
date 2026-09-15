import * as XLSX from "xlsx";

const PAIR_KEY = /^pair(\d+)$/;

function pairNumbers(doc) {
  return Object.keys(doc)
    .filter((key) => PAIR_KEY.test(key))
    .map((key) => Number(key.match(PAIR_KEY)[1]))
    .sort((a, b) => a - b);
}

// Builds the same rows/columns AttendanceTable renders (Employee ID, Name,
// Date, then IN/OUT per pair) and downloads them as an .xlsx file.
export function exportAttendanceToExcel(records, filename = "attendance") {
  if (!records.length) return;

  const maxPairs = Math.max(...records.map((doc) => Math.max(0, ...pairNumbers(doc))));
  const pairCols = Array.from({ length: maxPairs }, (_, i) => i + 1);

  const header = ["Employee ID", "Name", "Date"];
  pairCols.forEach((n) => header.push(`Pair ${n} IN`, `Pair ${n} OUT`));

  const rows = records.map((doc) => {
    const row = [doc.ID, doc.NAME, doc.Date];
    pairCols.forEach((n) => {
      const pair = doc[`pair${n}`];
      row.push(pair?.IN || "", pair?.OUT || "");
    });
    return row;
  });

  const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  worksheet["!cols"] = header.map((_, i) => ({ wch: i < 2 ? 20 : 12 }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance");

  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `${filename}-${date}.xlsx`);
}
