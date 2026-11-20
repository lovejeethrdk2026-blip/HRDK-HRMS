import { useEffect, useState } from "react";
import api from "../api/axios";
import { useAuth } from "../auth/AuthContext";
import SalarySplit, { rupees } from "../components/SalarySplit";
import { TransferForm } from "../components/StateTransfer";
import { DepartmentTransferForm } from "../components/DepartmentTransfer";
import { SalaryRevisionForm } from "../components/SalaryRevision";
import { DepartmentChanges, PayrollHistory, SalaryChanges, StateChanges } from "../components/ChangeHistory";
import { ExitForm, ExitPanel } from "../components/EmployeeExit";
import { exportTransfersToExcel } from "../utils/exportTransfers";
import { exportExitsToExcel } from "../utils/exportExits";
import { exportSalarySheet } from "../utils/exportSalarySheet";

// "YYYY-MM" of last month: the month whose salary is usually paid now.
function lastMonth() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
import { exportEmployeeStatesToExcel, exportEmployeeToExcel, exportEmployeesToExcel } from "../utils/exportEmployees";
import { exportEmployeeFullHistory } from "../utils/exportFullHistory";
import { statusOf } from "../utils/employeeStatus";
import { openExitOf, stateHistoryOf } from "@salary";
import AddEmployee from "./AddEmployee";
import { inMyDepartments, myDepartmentNames } from "../utils/userScope";

// Employees tab: one card per employee saved on Add Employee, newest first,
// from GET /api/employees (server/employee/employee.controller.js).

// "Lovejeet gehlot" -> "LG"
function initials(name) {
  const words = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0].toUpperCase()).join("") || "?";
}

// The Active / Inactive / All buttons: which statuses each shows.
const STATUS_FILTERS = [
  ["active", "Active", ["active", "leaving"]],
  ["inactive", "Inactive", ["left"]],
  ["all", "All", ["active", "leaving", "left"]]
];

// "Left 31-10-2026" / "Leaving 15-11-2026" chip; nothing while working.
function ExitChip({ employee }) {
  const status = statusOf(employee);
  if (status === "active") return null;
  const day = openExitOf(employee).lastWorkingDay;
  return (
    <span className={`emp-chip ${status === "left" ? "emp-chip-left" : "emp-chip-leaving"}`}>
      {status === "left" ? `Left ${day}` : `Leaving ${day}`}
    </span>
  );
}

// PF / ESIC chip: green when applicable, grey when not.
function Applicable({ label, value }) {
  return (
    <span className={`emp-chip${value ? " emp-chip-on" : ""}`}>
      {label} {value ? "Yes" : "No"}
    </span>
  );
}

// The rest of the joining sheet, shown when a card is opened: section title
// and [label, value] rows. The CTC rows only when the role may see salary.
function detailSections(employee, seeSalary) {
  const { otherId = {}, emergencyContact = {}, address = {}, bank = {} } = employee;
  const permanent = employee.permanentAddress || {};
  const ctcRows = seeSalary
    ? [
        ["Monthly CTC", employee.monthlyCtc == null ? "" : rupees(employee.monthlyCtc)],
        ["Yearly CTC", employee.yearlyCtc == null ? "" : rupees(employee.yearlyCtc)]
      ]
    : [];
  return [
    [
      "Work",
      [
        ["Initials No.", employee.initialsNo],
        ["Salutation", employee.salutation],
        ["Gender", employee.gender],
        ["Department", employee.department],
        ["Sub department", employee.subDepartment],
        ["Designation", employee.designation],
        ["Role", employee.employeeRole],
        ["Reporting manager", employee.reportingManager],
        ["State", employee.state],
        ...ctcRows,
        ["Date of joining", employee.joiningDate],
        ["Salary type", employee.salaryType],
        ["Employment type", employee.employmentType],
        ["Confirmation date", employee.confirmationDate],
        ["Work location", employee.workLocation],
        ["Weekly off", employee.weeklyOff],
        ["UAN no.", employee.uanNo],
        ["ESIC no.", employee.esicNo],
        ["Other benefit", employee.otherBenefits]
      ]
    ],
    [
      "Personal",
      [
        ["Mobile no.", employee.mobile],
        ["Aadhaar no.", employee.aadhaarNo],
        ["PAN no.", employee.pan],
        [otherId.type || "Other ID", otherId.number]
      ]
    ],
    [
      "Emergency contact",
      [
        ["Name", emergencyContact.name],
        ["Relation", emergencyContact.relation],
        ["Phone", emergencyContact.phone]
      ]
    ],
    [
      "Address",
      [
        ["Address", address.line],
        ["City", address.city],
        ["District", address.district],
        ["State", address.state],
        ["PIN code", address.pin],
        ["Country", address.country],
        [
          "Permanent address",
          employee.permanentSameAsCurrent === "Yes"
            ? "Same as current"
            : [permanent.line, permanent.city, permanent.district, permanent.state, permanent.pin, permanent.country]
                .filter(Boolean)
                .join(", ")
        ]
      ]
    ],
    [
      "Bank",
      [
        ["Bank name", bank.bankName],
        ["Account no.", bank.accountNo],
        ["IFSC code", bank.ifscCode]
      ]
    ]
  ];
}

// One employee in the grid: who they are, where they work and their CTC.
// Clicking it opens EmployeeDetail.
function EmployeeTile({ employee, onOpen }) {
  const { can } = useAuth();
  const where = [employee.department, employee.subDepartment].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      className={`card emp-tile${statusOf(employee) === "left" ? " is-left" : ""}`}
      onClick={() => onOpen(employee.employeeId)}
    >
      <span className="emp-tile-top">
        <span className="emp-avatar" aria-hidden="true">
          {initials(employee.name)}
        </span>
        <span className="emp-card-who">
          <span className="emp-card-name">{employee.name}</span>
          <span className="emp-card-code">#{employee.employeeId}</span>
        </span>
      </span>
      <span className="emp-tile-role">{employee.designation || "—"}</span>
      <span className="emp-tile-where">{where || "No department"}</span>
      <span className="emp-card-meta">
        <ExitChip employee={employee} />
        {employee.state && <span className="emp-chip">{employee.state}</span>}
        <Applicable label="PF" value={employee.pfApplicable} />
        <Applicable label="ESIC" value={employee.esicApplicable} />
      </span>
      <span className="emp-tile-foot">
        <span>
          {can("employees.salary") && (
            <>
              <span className="emp-card-ctc-label">Monthly CTC</span>
              <span className="emp-tile-ctc">{employee.monthlyCtc == null ? "—" : rupees(employee.monthlyCtc)}</span>
            </>
          )}
        </span>
        <span className="emp-tile-open">
          View
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </span>
    </button>
  );
}

// The employees as a list, one line each: who, role, department, state, PF /
// ESIC, joining date, status and CTC. Clicking a line opens EmployeeDetail.
function EmployeeList({ employees, onOpen }) {
  const { can } = useAuth();
  const seeSalary = can("employees.salary");
  return (
    <div className="card emp-list-card">
      <div className="table-scroll emp-list-scroll">
        <table className="people-table emp-list-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Designation</th>
              <th>Department</th>
              <th>State</th>
              <th>PF / ESIC</th>
              <th>Joined</th>
              <th>Status</th>
              {seeSalary && <th className="st-num">Monthly CTC</th>}
              <th aria-label="Open" />
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => {
              const open = () => onOpen(employee.employeeId);
              return (
                <tr
                  key={employee.employeeId}
                  className={`emp-list-row${statusOf(employee) === "left" ? " is-left" : ""}`}
                  tabIndex={0}
                  onClick={open}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), open())}
                >
                  <td>
                    <span className="emp-list-who">
                      <span className="emp-avatar emp-avatar-sm" aria-hidden="true">
                        {initials(employee.name)}
                      </span>
                      <span className="emp-card-name">{employee.name}</span>
                      <span className="emp-card-code">#{employee.employeeId}</span>
                    </span>
                  </td>
                  <td>{employee.designation || "—"}</td>
                  <td>
                    {employee.department || "—"}
                    {employee.subDepartment && <span className="emp-list-sub"> · {employee.subDepartment}</span>}
                  </td>
                  <td>{employee.state || "—"}</td>
                  <td>
                    <span className="emp-list-chips">
                      <Applicable label="PF" value={employee.pfApplicable} />
                      <Applicable label="ESIC" value={employee.esicApplicable} />
                    </span>
                  </td>
                  <td className="emp-list-date">{employee.joiningDate || "—"}</td>
                  <td>
                    <ExitChip employee={employee} />
                    {statusOf(employee) === "active" && <span className="emp-chip emp-chip-on">Active</span>}
                  </td>
                  {seeSalary && (
                    <td className="st-num emp-list-ctc">
                      {employee.monthlyCtc == null ? "—" : rupees(employee.monthlyCtc)}
                    </td>
                  )}
                  <td className="emp-list-open">
                    View
                    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                      <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// One employee opened from the grid: who they are and their CTC, the Edit,
// Salary revision and Transfer buttons, and four boxes: every detail from the
// joining sheet, payroll (this month's split, month-wise history and salary
// revisions), and the state and department changes side by side, each with
// the pay before and after.
function EmployeeDetail({ employee, onEdit, onTransferred }) {
  const { can } = useAuth(); // what this role may see and do (Roles & Permissions page)
  const seeSalary = can("employees.salary");
  const [transferring, setTransferring] = useState(""); // "", "salary", "state", "department" or "exit"
  const exit = openExitOf(employee); // set once they have left (or are leaving)
  const toggleTransfer = (kind) => setTransferring((was) => (was === kind ? "" : kind));
  const finishTransfer = (kind) => (updated) => {
    setTransferring("");
    onTransferred(updated, kind);
  };
  const role = [employee.designation, employee.department, employee.subDepartment].filter(Boolean).join(" · ");
  const [historyBusy, setHistoryBusy] = useState(false); // Full history download in progress
  const [historyNote, setHistoryNote] = useState("");

  async function downloadFullHistory() {
    setHistoryBusy(true);
    setHistoryNote("");
    try {
      const { months, paySheetError } = await exportEmployeeFullHistory(employee, { seeSalary });
      setHistoryNote(
        paySheetError
          ? `Downloaded ${months} months, but the Pay Sheet could not be read: ${paySheetError}`
          : `Downloaded ${months} month${months === 1 ? "" : "s"} of history.`
      );
    } catch (err) {
      setHistoryNote(`Could not download: ${err.message}`);
    } finally {
      setHistoryBusy(false);
    }
  }

  return (
    <article className="card emp-card is-open">
      <div className="emp-card-head emp-card-head-static">
        <span className="emp-avatar" aria-hidden="true">
          {initials(employee.name)}
        </span>
        <span className="emp-card-who">
          <span className="emp-card-name">
            {employee.name}
            <span className="emp-card-code">#{employee.employeeId}</span>
          </span>
          {role && <span className="emp-card-role">{role}</span>}
          <span className="emp-card-meta">
            <ExitChip employee={employee} />
            {employee.state && <span className="emp-chip">{employee.state}</span>}
            {employee.joiningDate && <span className="emp-chip">Joined {employee.joiningDate}</span>}
            <Applicable label="PF" value={employee.pfApplicable} />
            <Applicable label="ESIC" value={employee.esicApplicable} />
          </span>
        </span>
        {seeSalary && (
        <span className="emp-card-ctc">
          <span className="emp-card-ctc-label">Monthly CTC</span>
          <span className="emp-card-ctc-value">
            {employee.monthlyCtc == null ? "—" : rupees(employee.monthlyCtc)}
          </span>
          {employee.yearlyCtc != null && (
            <span className="emp-card-ctc-sub">{rupees(employee.yearlyCtc)} a year</span>
          )}
        </span>
        )}
      </div>

      <div className="emp-card-body">
        <div className="emp-card-actions">
          {can("employees.report") && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => exportEmployeeToExcel(employee, { seeSalary })}
              title="Every detail, month-wise payroll, transfers, history and exits"
            >
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path
                  d="M8 2v8M4.5 6.5L8 10l3.5-3.5M3 13h10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Download Excel
            </button>
          )}
          {can("employees.report") && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={downloadFullHistory}
              disabled={historyBusy}
              title="One sheet, one row per month: every detail (family, IDs, bank, nominees), that month's state, department and pay, what the Pay Sheet paid, and every change"
            >
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path
                  d="M8 2v8M4.5 6.5L8 10l3.5-3.5M3 13h10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {historyBusy ? "Preparing…" : "Full history (1 sheet)"}
            </button>
          )}
          {can("employees.report") && (
            <button
              type="button"
              className="btn"
              onClick={() => exportEmployeeStatesToExcel(employee, { seeSalary })}
              title="One Excel file per state worked in: stays from joining to the end, and that state's payroll"
            >
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path
                  d="M8 2v8M4.5 6.5L8 10l3.5-3.5M3 13h10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              State-wise Excel
              {new Set(stateHistoryOf(employee).map((stay) => stay.state)).size > 1 &&
                ` (${new Set(stateHistoryOf(employee).map((stay) => stay.state)).size} files)`}
            </button>
          )}
          {can("employees.add") && (
          <button type="button" className="btn" onClick={() => onEdit(employee)}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path
                d="M10.5 2.5l3 3L6 13H3v-3l7.5-7.5z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
            Edit details
          </button>
          )}
          {can("employees.transfer") && !exit && [
            ["salary", "Salary revision"],
            ["state", "State transfer"],
            ["department", "Department transfer"],
            ["exit", "Exit"]
          ].map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              className="btn"
              aria-expanded={transferring === kind}
              onClick={() => toggleTransfer(kind)}
            >
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path
                  d={
                    kind === "salary"
                      ? "M2 12l4-4 3 3 5-6M10 5h4v4"
                      : kind === "exit"
                        ? "M9 3H3v10h6M7 8h7M11 5l3 3-3 3"
                        : "M2 5h10l-3-3M14 11H4l3 3"
                  }
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {label}
            </button>
          ))}
        </div>
        {historyNote && (
          <p className="emp-box-note" role="status">
            {historyNote}
          </p>
        )}
        {transferring === "salary" && (
          <SalaryRevisionForm
            employee={employee}
            onCancel={() => setTransferring("")}
            onDone={finishTransfer("salary")}
          />
        )}
        {transferring === "state" && (
          <TransferForm employee={employee} onCancel={() => setTransferring("")} onDone={finishTransfer("state")} />
        )}
        {transferring === "department" && (
          <DepartmentTransferForm
            employee={employee}
            onCancel={() => setTransferring("")}
            onDone={finishTransfer("department")}
          />
        )}
        {transferring === "exit" && !exit && (
          <ExitForm employee={employee} onCancel={() => setTransferring("")} onDone={finishTransfer("exit")} />
        )}
        {exit && (
          <ExitPanel
            employee={employee}
            exit={exit}
            canChange={can("employees.transfer")}
            onDone={(updated, kind) => onTransferred(updated, kind)}
          />
        )}
        <section className="emp-box">
          <h3 className="emp-box-title">Employee details</h3>
          <p className="emp-box-note">Everything from the joining sheet, as it stands today.</p>
          <div className="emp-details">
            {detailSections(employee, seeSalary).map(([title, rows]) => (
              <section key={title} className="emp-detail">
                <h3 className="ss-group-title">{title}</h3>
                <dl className="ss-rows">
                  {rows.map(([label, value]) => (
                    <div key={label} className="ss-row">
                      <dt>{label}</dt>
                      <dd className="emp-detail-value">{value || "—"}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </section>
        {seeSalary && (
        <>
        <section className="emp-box">
          <h3 className="emp-box-title">Payroll</h3>
          <p className="emp-box-note">
            This month's split, what was actually paid each month (from Pay Sheet 1, BC365), and every salary
            revision with the pay before and after.
          </p>
          <SalarySplit salary={employee.salary} />
          <h4 className="emp-box-sub">Payroll history</h4>
          <PayrollHistory employee={employee} />
          <h4 className="emp-box-sub">Salary revisions</h4>
          <SalaryChanges employee={employee} />
        </section>
        <div className="emp-box-pair">
          <StateChanges employee={employee} />
          <DepartmentChanges employee={employee} />
        </div>
        </>
        )}
      </div>
    </article>
  );
}

export default function Employees({ onNavigate }) {
  const [employees, setEmployees] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // the employee open in the edit form
  const [saved, setSaved] = useState(null); // { employeeId, name } of the last edit
  const [moved, setMoved] = useState(null); // { record, kind } of the last transfer
  const [reportNote, setReportNote] = useState(""); // what the last transfer report download held
  const [salaryMonth, setSalaryMonth] = useState(lastMonth); // "YYYY-MM" for Download salary sheet
  const [salaryBusy, setSalaryBusy] = useState(false);
  const [openId, setOpenId] = useState(null); // employeeId shown in full, null: the grid
  const [departments, setDepartments] = useState([]); // the Department tab's list, for the filter
  const [filter, setFilter] = useState({ department: "", subDepartment: "" }); // "": all
  const [statusFilter, setStatusFilter] = useState("active"); // a STATUS_FILTERS key
  const [layout, setLayout] = useState("list"); // "list": one line each, "cards": the grid
  const subDepartments = (departments.find((d) => d.name === filter.department)?.subDepartments || []).map(
    (s) => s.name
  );
  // "Their department" roles see only employees of the user's own department.
  const { user, can } = useAuth();
  const ownOnly = user.role !== "admin" && user.employeeScope === "department";
  const visible = (employees || []).filter(
    (employee) => !ownOnly || inMyDepartments(user, employee)
  );
  const opened = openId && visible.find((employee) => employee.employeeId === openId);
  const inDepartment = visible.filter(
    (employee) =>
      (!filter.department || employee.department === filter.department) &&
      (!filter.subDepartment || employee.subDepartment === filter.subDepartment)
  );
  // How many of the department filter's employees each status button holds.
  const statusCounts = Object.fromEntries(
    STATUS_FILTERS.map(([key, , statuses]) => [key, inDepartment.filter((e) => statuses.includes(statusOf(e))).length])
  );
  const statusesShown = STATUS_FILTERS.find(([key]) => key === statusFilter)[2];
  const shown = inDepartment.filter((employee) => statusesShown.includes(statusOf(employee)));
  const filtered = Boolean(filter.department || filter.subDepartment || statusFilter !== "all");

  function openEmployee(employeeId) {
    setSaved(null);
    setMoved(null);
    setOpenId(employeeId);
    window.scrollTo(0, 0);
  }

  async function load() {
    setError("");
    try {
      const { data } = await api.get("/employees");
      setEmployees(data);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    }
  }

  useEffect(() => {
    load();
    let cancelled = false;
    api
      .get("/departments")
      .then(({ data }) => !cancelled && setDepartments(data.departments || []))
      .catch(() => {}); // the filter then lists no departments; the grid still works
    return () => {
      cancelled = true;
    };
  }, []);

  function edit(employee) {
    setSaved(null);
    setMoved(null);
    setEditing(employee);
    window.scrollTo(0, 0);
  }

  function finishEdit(updated) {
    setEditing(null);
    if (updated) {
      setSaved({ employeeId: updated.employeeId, name: updated.name });
      setOpenId(updated.employeeId);
      load();
    }
    window.scrollTo(0, 0);
  }

  if (editing) {
    return (
      <AddEmployee
        employee={editing}
        onNavigate={onNavigate}
        onSaved={finishEdit}
        onCancel={() => finishEdit(null)}
      />
    );
  }

  let body;
  if (error) {
    body = (
      <div className="card">
        <p className="state-panel">
          Could not load employees: {error}
          <br />
          <button type="button" className="btn" onClick={load}>
            Try again
          </button>
        </p>
      </div>
    );
  } else if (!employees) {
    body = (
      <div className="card">
        <p className="state-panel">Loading employees…</p>
      </div>
    );
  } else if (visible.length === 0) {
    body = (
      <div className="card">
        <p className="state-panel">
          {ownOnly ? `No employees in ${myDepartmentNames(user, "your department")} yet.` : "No employees yet."}
          <br />
          {can("employees.add") && (
            <button type="button" className="btn" onClick={() => onNavigate("addEmployee")}>
              Add Employee
            </button>
          )}
        </p>
      </div>
    );
  } else if (opened) {
    body = (
      <div className="emp-list">
        <button type="button" className="btn btn-ghost emp-back" onClick={() => openEmployee(null)}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M10 4l-4 4 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          All employees
        </button>
        <EmployeeDetail
          key={opened.employeeId}
          employee={opened}
          onEdit={edit}
          onTransferred={(record, kind) => {
            setSaved(null);
            setMoved({ record, kind });
            load();
          }}
        />
      </div>
    );
  } else {
    body = (
      <>
        <div className="filters emp-filters">
          <div className="field-group">
            <span className="emp-status-label" id="emp-status">
              Status
            </span>
            <div className="segmented emp-status" role="group" aria-labelledby="emp-status">
              {STATUS_FILTERS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={statusFilter === key ? "active" : undefined}
                  aria-pressed={statusFilter === key}
                  onClick={() => setStatusFilter(key)}
                >
                  {label} <span className="emp-status-count">{statusCounts[key]}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="field-group">
            <label htmlFor="emp-dept">Department</label>
            <select
              id="emp-dept"
              value={filter.department}
              onChange={(e) => setFilter({ department: e.target.value, subDepartment: "" })}
            >
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field-group">
            <label htmlFor="emp-sub">Sub department</label>
            <select
              id="emp-sub"
              value={filter.subDepartment}
              disabled={!subDepartments.length}
              onChange={(e) => setFilter((f) => ({ ...f, subDepartment: e.target.value }))}
            >
              <option value="">
                {!filter.department ? "Pick a department first" : subDepartments.length ? "All sub departments" : "No sub departments"}
              </option>
              {subDepartments.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="field-group">
            <span className="emp-status-label" id="emp-layout">
              View
            </span>
            <div className="segmented emp-status" role="group" aria-labelledby="emp-layout">
              {[
                ["list", "List"],
                ["cards", "Cards"]
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={layout === key ? "active" : undefined}
                  aria-pressed={layout === key}
                  onClick={() => setLayout(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="filters-actions">
            {Boolean(filter.department || filter.subDepartment) && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setFilter({ department: "", subDepartment: "" })}
              >
                Clear filters
              </button>
            )}
            {can("employees.report") && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={!shown.length}
                onClick={() => {
                  const label = [
                    STATUS_FILTERS.find(([key]) => key === statusFilter)[1],
                    filter.department,
                    filter.subDepartment
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  exportEmployeesToExcel(shown, { seeSalary: can("employees.salary"), label });
                  setReportNote(`Downloaded ${shown.length} employee${shown.length === 1 ? "" : "s"} (${label}).`);
                }}
              >
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                  <path
                    d="M8 2v8M4.5 6.5L8 10l3.5-3.5M3 13h10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Download Excel ({shown.length})
              </button>
            )}
          </div>
        </div>
        {shown.length ? (
          layout === "list" ? (
            <EmployeeList employees={shown} onOpen={openEmployee} />
          ) : (
            <div className="emp-grid">
              {shown.map((employee) => (
                <EmployeeTile key={employee.employeeId} employee={employee} onOpen={openEmployee} />
              ))}
            </div>
          )
        ) : (
          <div className="card">
            <p className="state-panel">
              No {statusFilter === "all" ? "" : `${statusFilter} `}employees
              {filter.department ? ` in ${[filter.department, filter.subDepartment].filter(Boolean).join(" · ")}` : ""}.
            </p>
          </div>
        )}
      </>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Employees</h1>
          <p className="page-subtitle">
            Employee master
            {visible.length
              ? ` · ${filtered && !opened ? `${shown.length} of ` : ""}${visible.length} employee${visible.length === 1 ? "" : "s"}`
              : ""}
            .
          </p>
        </div>
        {can("employees.report") && (
        <div className="page-header-actions">
          <button
            type="button"
            className="btn"
            disabled={!visible.length}
            onClick={async () => {
              const { transfers } = await exportTransfersToExcel(visible);
              setReportNote(`Downloaded ${transfers} transfer${transfers === 1 ? "" : "s"} and the full history.`);
            }}
          >
            Download transfer report
          </button>
          <button
            type="button"
            className="btn"
            disabled={!visible.length}
            onClick={async () => {
              const exits = await exportExitsToExcel(visible);
              setReportNote(exits ? `Downloaded ${exits} exit${exits === 1 ? "" : "s"}.` : "No one has left yet.");
            }}
          >
            Download exit report
          </button>
          {can("employees.salary") && (
            <>
              <input
                type="month"
                aria-label="Salary sheet month"
                value={salaryMonth}
                onChange={(e) => setSalaryMonth(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-primary"
                disabled={!salaryMonth || salaryBusy}
                onClick={async () => {
                  setSalaryBusy(true);
                  try {
                    const count = await exportSalarySheet(salaryMonth);
                    setReportNote(
                      count
                        ? `Downloaded the salary sheet for ${salaryMonth}: ${count} employee${count === 1 ? "" : "s"}.`
                        : `No one was on the rolls in ${salaryMonth}.`
                    );
                  } catch (err) {
                    setReportNote(err.response?.data?.message || "Could not make the salary sheet.");
                  } finally {
                    setSalaryBusy(false);
                  }
                }}
              >
                {salaryBusy ? "Working…" : "Download salary sheet"}
              </button>
            </>
          )}
        </div>
        )}
      </div>
      {reportNote && (
        <div className="detail-banner" role="status">
          <span>{reportNote}</span>
        </div>
      )}
      {saved && (
        <div className="detail-banner" role="status">
          <span>
            Changes to {saved.employeeId} ({saved.name}) saved.
          </span>
        </div>
      )}
      {moved && (
        <div className="detail-banner" role="status">
          <span>
            {moved.kind === "exit" ? (
              <>
                {moved.record.employeeId} ({moved.record.name}) leaves with last working day{" "}
                {moved.record.exits?.at(-1)?.lastWorkingDay}.
              </>
            ) : moved.kind === "rejoin" ? (
              <>
                {moved.record.employeeId} ({moved.record.name}) rejoined from {moved.record.exits?.at(-1)?.rejoinDate}.
              </>
            ) : moved.kind === "undo" ? (
              <>
                {moved.record.employeeId} ({moved.record.name}) exit undone; active again.
              </>
            ) : moved.kind === "salary" ? (
              <>
                {moved.record.employeeId} ({moved.record.name}) moved to {rupees(moved.record.monthlyCtc)} a month from{" "}
                {moved.record.payHistory?.at(-1)?.from}.
              </>
            ) : (
              <>
                {moved.record.employeeId} ({moved.record.name}) transferred to{" "}
                {moved.kind === "department"
                  ? [moved.record.department, moved.record.subDepartment].filter(Boolean).join(" · ")
                  : moved.record.state}{" "}
                from{" "}
                {(moved.kind === "department" ? moved.record.departmentHistory : moved.record.stateHistory)?.at(-1)?.from}.
              </>
            )}
          </span>
        </div>
      )}
      {body}
    </div>
  );
}
