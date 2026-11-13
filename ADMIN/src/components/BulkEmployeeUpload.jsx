import { useRef, useState } from "react";
import api from "../api/axios";
import { COUNTRIES, STATES, STATE_OF_CITY } from "../data/places";

// Add Employee > Bulk upload: a template workbook with one column per Add
// Employee field (dropdowns where the form has them), and an upload that saves
// each filled row through POST /api/employees, the same check the form gets.
// fields are the Add Employee form's fields; departments the Department tab's.

const SHEET = "Employees";
const ID_TYPES = ["Voter ID", "Driving licence", "Ration card", "Passport"];
const RELATIONS = ["Father", "Mother", "Spouse", "Brother", "Sister", "Son", "Daughter", "Friend"];
const EMPLOYMENT_TYPES = ["Permanent", "Contract", "Trainee", "Probation"];
const WEEK_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const YES_NO = ["Yes", "No"];
const TEMPLATE_ROWS = 1000;

// Columns holding a DD-MM-YYYY date.
const DATE_COLUMNS = new Set(["joiningDate", "confirmationDate"]);

// Monthly CTC below which PF and ESIC are always Yes (as the server applies).
const PF_ESIC_LIMIT = 25500;

// Column headings where the form's own label would be unclear or repeated.
const HEADINGS = {
  joiningDate: "Date of joining (DD-MM-YYYY)",
  confirmationDate: "Probation end / confirmation date (DD-MM-YYYY)",
  "emergencyContact.relation": "Emergency contact relation",
  "address.line": "Address",
  "address.city": "City",
  "address.district": "District",
  "address.state": "Address state",
  "address.pin": "PIN code",
  "address.country": "Country",
  permanentSameAsCurrent: "Permanent address same as current (Yes/No)",
  "permanentAddress.line": "Permanent address",
  "permanentAddress.city": "Permanent city",
  "permanentAddress.district": "Permanent district",
  "permanentAddress.state": "Permanent state",
  "permanentAddress.pin": "Permanent PIN code",
  "permanentAddress.country": "Permanent country",
  "shift.in": "Shift in (HH:MM)",
  "shift.out": "Shift out (HH:MM)"
};
const headingOf = (field) => HEADINGS[field.path] || field.label;
const normal = (text) => String(text ?? "").trim().toLowerCase().replace(/\s+/g, " ");

// Columns typed as text, so Excel keeps leading zeros and long numbers whole.
const TEXT_COLUMNS = new Set([
  "employeeId",
  "initialsNo",
  "joiningDate",
  "confirmationDate",
  "uanNo",
  "esicNo",
  "address.pin",
  "permanentAddress.pin",
  "aadhaarNo",
  "otherId.number",
  "mobile",
  "emergencyContact.phone",
  "bank.accountNo",
  "shift.in",
  "shift.out"
]);

const pad = (n) => String(n).padStart(2, "0");

// A cell's value as the form would hold it: dates as DD-MM-YYYY, times as HH:MM.
function cellText(cell, path) {
  let value = cell.value;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    if ("result" in value) value = value.result;
    else if (value.richText) value = value.richText.map((part) => part.text).join("");
    else if ("text" in value) value = value.text;
  }
  if (value == null) return "";
  if (value instanceof Date) {
    if (path.startsWith("shift.")) return `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}`;
    return `${pad(value.getUTCDate())}-${pad(value.getUTCMonth() + 1)}-${value.getUTCFullYear()}`;
  }
  // A date pasted into the text-formatted column arrives as Excel's day count.
  if (typeof value === "number" && DATE_COLUMNS.has(path) && value > 1) {
    return cellText({ value: new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000) }, path);
  }
  // A time typed as a number: a fraction of a day.
  if (typeof value === "number" && path.startsWith("shift.") && value < 1) {
    const minutes = Math.round(value * 24 * 60);
    return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  }
  return String(value).trim();
}

// "1/3/2026", "01.03.2026" -> "01-03-2026"; anything else as it is.
function toDmy(text) {
  const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text);
  return m ? `${pad(m[1])}-${pad(m[2])}-${m[3]}` : text;
}

// "9:30", "6:30 PM" -> "09:30", "18:30"; anything else as it is.
function toTime(text) {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?$/.exec(text);
  if (!m) return text;
  let hours = Number(m[1]);
  if (m[3]) hours = (hours % 12) + (m[3].toUpperCase() === "PM" ? 12 : 0);
  return `${pad(hours)}:${m[2]}`;
}

// The listed spelling of text, matched ignoring case; text itself when unlisted.
const listed = (choices, text) => choices.find((choice) => normal(choice) === normal(text)) ?? text;

// A sheet row's values into the record POST /api/employees takes:
// { record } or { error }.
function recordFrom(values, departments) {
  const v = { ...values };
  const department = departments.find((d) => normal(d.name) === normal(v.department));
  if (!department) return { error: `Department "${v.department}" is not in the Department tab` };
  v.department = department.name;
  const subs = (department.subDepartments || []).map((s) => s.name);
  if (subs.length) {
    if (!subs.some((s) => normal(s) === normal(v.subDepartment))) {
      return { error: `Sub department must be one of ${department.name}'s: ${subs.join(", ")}` };
    }
    v.subDepartment = listed(subs, v.subDepartment);
  } else v.subDepartment = "";

  v.joiningDate = toDmy(v.joiningDate);
  v.confirmationDate = toDmy(v.confirmationDate);
  v.employmentType = listed(EMPLOYMENT_TYPES, v.employmentType);
  v.weeklyOff = listed(WEEK_DAYS, v.weeklyOff);
  v["shift.in"] = toTime(v["shift.in"]);
  v["shift.out"] = toTime(v["shift.out"]);
  v.state = listed(STATES, v.state);
  v["address.state"] = listed(STATES, v["address.state"]);
  v["address.country"] = listed(COUNTRIES, v["address.country"] || "India");
  v["otherId.type"] = listed(ID_TYPES, v["otherId.type"]);
  v["emergencyContact.relation"] = listed(RELATIONS, v["emergencyContact.relation"]);
  // A listed city settles its state, as the form's City dropdown does.
  for (const group of ["address", "permanentAddress"]) {
    const city = Object.keys(STATE_OF_CITY).find((c) => normal(c) === normal(v[`${group}.city`]));
    if (city) {
      v[`${group}.city`] = city;
      v[`${group}.state`] ||= STATE_OF_CITY[city];
    }
  }
  for (const path of ["pfApplicable", "esicApplicable", "permanentSameAsCurrent"]) {
    const answer = normal(v[path]);
    v[path] = ["yes", "y", "true"].includes(answer) ? "Yes" : ["no", "n", "false"].includes(answer) ? "No" : v[path];
  }
  // Permanent address: a copy of the current one when "same as current" is Yes,
  // as the form saves it; otherwise its own columns (country India if blank).
  const addressParts = ["line", "city", "district", "state", "pin", "country"];
  if (v.permanentSameAsCurrent === "Yes") {
    for (const key of addressParts) v[`permanentAddress.${key}`] = v[`address.${key}`];
  } else {
    v["permanentAddress.state"] = listed(STATES, v["permanentAddress.state"]);
    const anyPermanent = addressParts.some((key) => v[`permanentAddress.${key}`]);
    v["permanentAddress.country"] = listed(COUNTRIES, v["permanentAddress.country"] || (anyPermanent ? "India" : ""));
  }
  // Monthly CTC follows yearly / 12 when left blank, as on the form.
  if (!v.monthlyCtc && v.yearlyCtc && Number(v.yearlyCtc) >= 0) v.monthlyCtc = String(Math.round(Number(v.yearlyCtc) / 12));
  if (v.monthlyCtc !== "" && Number(v.monthlyCtc) < PF_ESIC_LIMIT) {
    v.pfApplicable = "Yes";
    v.esicApplicable = "Yes";
  }

  const record = {};
  for (const [path, value] of Object.entries(v)) {
    if (!value) continue;
    const keys = path.split(".");
    let node = record;
    for (const key of keys.slice(0, -1)) node = node[key] ??= {};
    node[keys.at(-1)] = value;
  }
  return { record };
}

function download(buffer, name) {
  const url = URL.createObjectURL(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Template: the Employees sheet to fill, a hidden Lists sheet feeding its
// dropdowns, and a How to fill sheet.
async function downloadTemplate(fields, departments) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(SHEET, { views: [{ state: "frozen", ySplit: 1 }] });
  const lists = workbook.addWorksheet("Lists", { state: "hidden" });
  const help = workbook.addWorksheet("How to fill");

  const choices = {
    department: departments.map((d) => d.name),
    subDepartment: [...new Set(departments.flatMap((d) => (d.subDepartments || []).map((s) => s.name)))],
    state: STATES,
    "address.state": STATES,
    "address.country": COUNTRIES,
    pfApplicable: YES_NO,
    esicApplicable: YES_NO,
    employmentType: EMPLOYMENT_TYPES,
    weeklyOff: WEEK_DAYS,
    permanentSameAsCurrent: YES_NO,
    "permanentAddress.state": STATES,
    "permanentAddress.country": COUNTRIES,
    "otherId.type": ID_TYPES,
    "emergencyContact.relation": RELATIONS
  };
  // Each list in its own column of the Lists sheet; the range a dropdown reads.
  const ranges = {};
  Object.entries(choices).forEach(([path, items], i) => {
    if (!items.length) return;
    const column = lists.getColumn(i + 1);
    items.forEach((item, row) => (lists.getCell(row + 1, i + 1).value = item));
    ranges[path] = `Lists!$${column.letter}$1:$${column.letter}$${items.length}`;
  });

  sheet.columns = fields.map((field) => ({
    header: headingOf(field),
    width: Math.max(14, headingOf(field).length + 4),
    style: TEXT_COLUMNS.has(field.path) ? { numFmt: "@" } : {}
  }));
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
  header.alignment = { vertical: "middle", wrapText: true };
  header.height = 32;

  fields.forEach((field, i) => {
    const range = ranges[field.path];
    if (!range) return;
    const letter = sheet.getColumn(i + 1).letter;
    for (let row = 2; row <= TEMPLATE_ROWS; row++) {
      sheet.getCell(`${letter}${row}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [range],
        showErrorMessage: field.path !== "emergencyContact.relation",
        errorTitle: field.label,
        error: "Pick a value from the list."
      };
    }
  });

  help.columns = [{ width: 32 }, { width: 90 }];
  [
    ["How to fill", ""],
    ["One row", "One employee per row on the Employees sheet, from row 2. Keep the headings as they are."],
    ["Every column", "Required, as on the Add Employee form. Sub department only when the department has them."],
    ["Date of joining / confirmation", "DD-MM-YYYY, e.g. 01-03-2026."],
    ["Employment type / Weekly off", "Pick from the list: Permanent, Contract, Trainee, Probation / Sunday to Saturday."],
    ["UAN / ESIC no.", "12 digits / 10 digits."],
    ["PIN code", "6 digits."],
    ["Permanent address", "Yes in \"same as current\" copies the current address; otherwise fill the Permanent columns."],
    ["Yearly / Monthly CTC", "Numbers only. Monthly CTC may be left blank: it becomes Yearly ÷ 12."],
    ["PF / ESIC applicable", "Yes or No. Always Yes when monthly CTC is below ₹25,500."],
    ["Aadhaar / Mobile", "12 digits / 10 digits."],
    ["PAN / IFSC", "Like ABCDE1234F / SBIN0001234."],
    ["Shift in / out", "24-hour time, e.g. 09:30 and 18:30."],
    ["Department lists", "Departments and sub departments come from the Department tab when this file was downloaded."],
    ["Upload", "Add Employee > Bulk upload > Upload filled sheet. Rows that fail are listed with the reason; fix and upload only those again."]
  ].forEach((row, i) => {
    help.addRow(row);
    if (i === 0) help.getRow(1).font = { bold: true, size: 13 };
    else help.getCell(i + 1, 1).font = { bold: true };
  });

  download(await workbook.xlsx.writeBuffer(), "Employee_upload_template.xlsx");
}

// The filled rows of an uploaded workbook: [{ row, values }] or throws with a
// message for the page.
async function readRows(file, fields) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.getWorksheet(SHEET) || workbook.worksheets[0];
  if (!sheet) throw new Error("The file has no sheets.");

  // Columns found by heading, so their order does not matter.
  const columnOf = {};
  sheet.getRow(1).eachCell((cell, column) => {
    const field = fields.find((f) => [headingOf(f), f.label].some((h) => normal(h) === normal(cell.text)));
    if (field && !columnOf[field.path]) columnOf[field.path] = column;
  });
  // Only the required columns must be there; an older template without the
  // newer columns still uploads, those values left blank.
  const missing = fields.filter((field) => field.required && !columnOf[field.path]).map(headingOf);
  if (missing.length) throw new Error(`Missing columns: ${missing.join(", ")}. Use the template's headings.`);

  const rows = [];
  sheet.eachRow((row, number) => {
    if (number === 1) return;
    const values = Object.fromEntries(
      fields.map((f) => [f.path, columnOf[f.path] ? cellText(row.getCell(columnOf[f.path]), f.path) : ""])
    );
    if (Object.values(values).some(Boolean)) rows.push({ row: number, values });
  });
  return rows;
}

export default function BulkEmployeeUpload({ fields, departments, onNavigate }) {
  const fileInput = useRef(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [results, setResults] = useState(null); // [{ row, employeeId, name, ok, message }]

  async function template() {
    setBusy("template");
    setError("");
    try {
      await downloadTemplate(fields, departments);
    } catch (err) {
      setError(`Could not make the template: ${err.message}`);
    } finally {
      setBusy("");
    }
  }

  async function upload(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // the same file may be picked again after fixing it
    if (!file) return;
    setBusy("upload");
    setError("");
    setResults(null);
    try {
      const rows = await readRows(file, fields);
      if (!rows.length) throw new Error("No filled rows found under the headings.");
      const done = [];
      // One at a time, so the list fills in order and the server is not flooded.
      for (const { row, values } of rows) {
        const who = { row, employeeId: values.employeeId, name: values.name };
        const { record, error: problem } = recordFrom(values, departments);
        if (problem) {
          done.push({ ...who, ok: false, message: problem });
        } else {
          try {
            await api.post("/employees", record);
            done.push({ ...who, ok: true, message: "Saved" });
          } catch (err) {
            done.push({ ...who, ok: false, message: err.response?.data?.message || err.message });
          }
        }
        setResults([...done]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  const saved = results?.filter((r) => r.ok).length ?? 0;
  const failed = (results?.length ?? 0) - saved;

  return (
    <section className="card ae-card bulk-upload">
      <header className="ae-card-head">
        <span className="ae-card-num" aria-hidden="true">
          ⇪
        </span>
        <div>
          <h2 className="ae-card-title">Bulk upload from Excel</h2>
          <p className="ae-card-note">
            Download the template, fill one employee per row, then upload it. Each row is checked like this form.
          </p>
        </div>
      </header>

      <div className="bulk-actions">
        <button type="button" className="btn" onClick={template} disabled={Boolean(busy)}>
          {busy === "template" && <span className="spinner" aria-hidden="true" />}
          Download template
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => fileInput.current?.click()}
          disabled={Boolean(busy)}
        >
          {busy === "upload" && <span className="spinner" aria-hidden="true" />}
          {busy === "upload" ? "Uploading…" : "Upload filled sheet"}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".xlsx"
          hidden
          onChange={upload}
          aria-label="Filled employee sheet"
        />
      </div>

      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
        </div>
      )}

      {results && (
        <>
          <div className="bulk-summary" role="status">
            <span>
              {saved} saved{failed ? `, ${failed} not saved` : ""}
              {busy === "upload" ? " so far…" : "."}
            </span>
            {saved > 0 && !busy && (
              <button type="button" className="btn" onClick={() => onNavigate("employees")}>
                View in Employees
              </button>
            )}
          </div>
          <div className="table-scroll bulk-results">
            <table>
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Employee code</th>
                  <th>Name</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.row} className={r.ok ? "is-ok" : "is-failed"}>
                    <td>{r.row}</td>
                    <td>{r.employeeId}</td>
                    <td>{r.name}</td>
                    <td>{r.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
