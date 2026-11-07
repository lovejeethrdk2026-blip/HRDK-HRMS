import { useEffect, useState } from "react";
import api from "../api/axios";
import { CITIES_BY_STATE, COUNTRIES, STATES, STATE_OF_CITY } from "../data/places";
import { REPORTING } from "../data/reportingChart";
import BulkEmployeeUpload from "../components/BulkEmployeeUpload";
import SalarySplit from "../components/SalarySplit";
import EmployeeDocuments, { missingKyc, uploadDocuments } from "../components/EmployeeDocuments";
import { salaryStructure } from "@salary";

// Employees > Add Employee, laid out like the HR joining sheet. Posts to
// POST /api/employees (server/employee/employee.controller.js).

const WEEK_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Fields kept as DD-MM-YYYY but picked with a date input (YYYY-MM-DD).
const DATE_PATHS = new Set(["joiningDate", "confirmationDate"]);

const RELATIONS = ["Father", "Mother", "Spouse", "Brother", "Sister", "Son", "Daughter", "Friend"];

// Each field is { label, path, ...input props }; path is where the value goes
// in the saved record ("bank.ifscCode" -> { bank: { ifscCode } }). type
// "select" takes options, "yesno" is a Yes / No pick, "city" is the city
// dropdown grouped by state (picking one fills in State and Country),
// "department" / "subDepartment" are the Department tab's list (the sub
// department list follows the picked department), wide fields span the row,
// initial is the value a fresh form starts with.
// Only the employee code and name are required (required: true). Each section is { id, title, note, fields }; id is
// the anchor the side list jumps to.
const SECTIONS = [
  {
    id: "employee",
    title: "Employee",
    note: "Who they are and where they sit.",
    fields: [
      {
        label: "Employee code",
        path: "employeeId",
        autoFocus: true,
        required: true,
        pattern: "[A-Za-z0-9_\\-]{1,32}",
        title: "Letters, digits, - and _ (up to 32)"
      },
      {
        label: "Initials No.",
        path: "initialsNo",
        inputMode: "numeric",
        pattern: "\\d{1,10}",
        title: "BC365 Initials No., digits only (links Pay Sheet salary)"
      },
      { label: "Employee name", path: "name", required: true },
      { label: "Department", path: "department", type: "department" },
      { label: "Sub department", path: "subDepartment", type: "subDepartment" },
      { label: "Designation", path: "designation" },
      { label: "Role", path: "employeeRole", type: "select", options: ["Employee", "Manager", "Admin"] },
      // Suggests the Reporting Chart's names, so the new employee lands under the right box.
      { label: "Reporting manager name", path: "reportingManager", list: "reporting-managers", upper: true }
    ]
  },
  {
    id: "pay",
    title: "Joining & pay",
    note: "Joining date, salary and statutory benefits.",
    fields: [
      { label: "Date of joining", path: "joiningDate", type: "date" },
      { label: "Salary type", path: "salaryType", type: "select", options: ["Salary", "Wages"] },
      {
        label: "Employment type",
        path: "employmentType",
        type: "select",
        options: ["Permanent", "Contract", "Trainee", "Probation"]
      },
      { label: "Probation end / confirmation date", path: "confirmationDate", type: "date" },
      { label: "Company / work location", path: "workLocation" },
      { label: "Weekly off", path: "weeklyOff", type: "select", options: WEEK_DAYS },
      { label: "Yearly CTC (₹)", path: "yearlyCtc", type: "number", min: 0, step: "0.01" },
      { label: "Monthly CTC (₹)", path: "monthlyCtc", type: "number", min: 0, step: "0.01" },
      { label: "State", path: "state", type: "select", options: STATES },
      { label: "PF applicable", path: "pfApplicable", type: "yesno" },
      { label: "ESIC applicable", path: "esicApplicable", type: "yesno" },
      {
        label: "UAN no. (PF)",
        path: "uanNo",
        inputMode: "numeric",
        pattern: "\\d{12}",
        title: "12 digits"
      },
      {
        label: "ESIC no. (IP number)",
        path: "esicNo",
        inputMode: "numeric",
        pattern: "\\d{10}",
        title: "10 digits"
      },
      { label: "Other benefit, if any", path: "otherBenefits", wide: true }
    ]
  },
  {
    id: "personal",
    title: "Personal information",
    note: "ID proofs, phone and emergency contact.",
    fields: [
      {
        label: "Aadhaar no.",
        path: "aadhaarNo",
        inputMode: "numeric",
        maxLength: 12,
        pattern: "\\d{12}",
        title: "12 digits",
        placeholder: "12 digits"
      },
      {
        label: "PAN no.",
        path: "pan",
        maxLength: 10,
        pattern: "[A-Z]{5}[0-9]{4}[A-Z]",
        title: "Like ABCDE1234F",
        placeholder: "ABCDE1234F",
        upper: true
      },
      {
        label: "Other ID proof",
        path: "otherId.type",
        type: "select",
        options: ["Voter ID", "Driving licence", "Ration card", "Passport"]
      },
      { label: "Other ID no.", path: "otherId.number" },
      {
        label: "Mobile no.",
        path: "mobile",
        type: "tel",
        inputMode: "numeric",
        maxLength: 10,
        pattern: "\\d{10}",
        title: "10 digits"
      },
      { label: "Emergency contact name", path: "emergencyContact.name" },
      {
        label: "Emergency contact no.",
        path: "emergencyContact.phone",
        type: "tel",
        inputMode: "numeric",
        maxLength: 10,
        pattern: "\\d{10}",
        title: "10 digits"
      },
      { label: "Relation", path: "emergencyContact.relation", list: "add-emp-relations" }
    ]
  },
  {
    id: "address",
    title: "Address",
    note: "Picking a city fills in its state and country.",
    fields: [
      { label: "Address", path: "address.line", type: "textarea", wide: true },
      { label: "City", path: "address.city", type: "city" },
      { label: "State", path: "address.state", type: "select", options: STATES },
      { label: "PIN code", path: "address.pin", inputMode: "numeric", maxLength: 6, pattern: "\\d{6}", title: "6 digits" },
      { label: "Country", path: "address.country", type: "select", options: COUNTRIES, initial: "India" },
      { label: "Permanent address same as current address", path: "permanentSameAsCurrent", type: "checkbox", wide: true },
      // Hidden while the tick box above is ticked (permanent: true); toRecord
      // then copies the current address into these.
      { label: "Permanent address", path: "permanentAddress.line", type: "textarea", wide: true, permanent: true },
      { label: "City", path: "permanentAddress.city", type: "city", permanent: true },
      { label: "State", path: "permanentAddress.state", type: "select", options: STATES, permanent: true },
      {
        label: "PIN code",
        path: "permanentAddress.pin",
        inputMode: "numeric",
        maxLength: 6,
        pattern: "\\d{6}",
        title: "6 digits",
        permanent: true
      },
      {
        label: "Country",
        path: "permanentAddress.country",
        type: "select",
        options: COUNTRIES,
        initial: "India",
        permanent: true
      }
    ]
  },
  {
    id: "bank",
    title: "Bank details",
    note: "The account salary is paid into.",
    fields: [
      { label: "Bank name", path: "bank.bankName" },
      {
        label: "Bank account no.",
        path: "bank.accountNo",
        inputMode: "numeric",
        maxLength: 18,
        pattern: "\\d{6,18}",
        title: "6 to 18 digits"
      },
      {
        label: "IFSC code",
        path: "bank.ifscCode",
        maxLength: 11,
        pattern: "[A-Z]{4}0[A-Z0-9]{6}",
        title: "Like SBIN0001234",
        placeholder: "SBIN0001234",
        upper: true
      }
    ]
  },
  {
    id: "shift",
    title: "Employee shift",
    note: "Usual in and out time.",
    fields: [
      { label: "In", path: "shift.in", type: "time" },
      { label: "Out", path: "shift.out", type: "time" }
    ]
  }
];

const FIELDS = SECTIONS.flatMap((section) => section.fields);

function emptyDraft() {
  return Object.fromEntries(FIELDS.map((field) => [field.path, field.initial ?? ""]));
}

// "2026-10-20" (date input) -> "20-10-2026", the DD-MM-YYYY the rest of the app uses.
function toDmy(isoDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate || "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : isoDate;
}

// "20-10-2026" (saved) -> "2026-10-20", for the date input.
function toIso(dmyDate) {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dmyDate || "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : dmyDate;
}

// A saved employee back into form values, for editing.
function draftFrom(employee) {
  const draft = emptyDraft();
  for (const path of Object.keys(draft)) {
    const value = path.split(".").reduce((node, key) => node?.[key], employee);
    if (value == null) continue;
    if (typeof value === "boolean") draft[path] = value ? "Yes" : "No";
    else draft[path] = DATE_PATHS.has(path) ? toIso(String(value)) : String(value);
  }
  return draft;
}

// { "bank.ifscCode": "X" } -> { bank: { ifscCode: "X" } }, leaving blanks out.
function toRecord(form) {
  const draft = { ...form };
  // Permanent address ticked "same as current": save the current address as it.
  if (draft.permanentSameAsCurrent === "Yes") {
    for (const key of ["line", "city", "state", "pin", "country"]) {
      draft[`permanentAddress.${key}`] = draft[`address.${key}`];
    }
  }
  const record = {};
  for (const [path, raw] of Object.entries(draft)) {
    const value = DATE_PATHS.has(path) ? toDmy(raw.trim()) : raw.trim();
    if (!value) continue;
    const keys = path.split(".");
    let node = record;
    for (const key of keys.slice(0, -1)) node = node[key] ??= {};
    node[keys.at(-1)] = value;
  }
  return record;
}

// Monthly split of the CTC, worked out as the form is filled in; the server
// works out the same figures again when it saves.
function SalaryBreakdown({ draft }) {
  if (draft.monthlyCtc === "") {
    return <p className="ae-salary-empty">Enter the CTC to see the monthly salary split.</p>;
  }
  const salary = salaryStructure({
    monthlyCtc: draft.monthlyCtc,
    state: draft.state,
    pfApplicable: draft.pfApplicable === "Yes",
    esicApplicable: draft.esicApplicable === "Yes"
  });
  return (
    <div className="ae-salary">
      <h3 className="ae-salary-title">Monthly salary split</h3>
      <SalarySplit salary={salary} />
    </div>
  );
}

const OTHER_CITY = "__other__";

// Monthly CTC below this makes PF and ESIC applicable Yes, and they cannot be
// changed (server/employee/employee.controller.js applies the same rule).
const PF_ESIC_LIMIT = 25600;
const STATUTORY_PATHS = ["pfApplicable", "esicApplicable"];
const belowPfEsicLimit = (monthlyCtc) => monthlyCtc !== "" && Number(monthlyCtc) < PF_ESIC_LIMIT;

// PF and ESIC forced to Yes when the draft's monthly CTC is below the limit.
function withStatutoryRule(draft) {
  if (!belowPfEsicLimit(draft.monthlyCtc)) return draft;
  return { ...draft, pfApplicable: "Yes", esicApplicable: "Yes" };
}

// City dropdown: the listed cities grouped by state, plus "Other" for a city
// not in the list, which then gets typed in below.
function CitySelect({ path, value, onChange }) {
  // A saved city that is not in the list opens as "Other".
  const [other, setOther] = useState(value !== "" && !STATE_OF_CITY[value]);

  return (
    <>
      <select
        className="detail-input"
        value={other ? OTHER_CITY : value}
        onChange={(e) => {
          const picked = e.target.value;
          setOther(picked === OTHER_CITY);
          onChange(path, picked === OTHER_CITY ? "" : picked);
        }}
      >
        <option value="">Select…</option>
        {Object.entries(CITIES_BY_STATE).map(([state, cities]) => (
          <optgroup key={state} label={state}>
            {cities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </optgroup>
        ))}
        <option value={OTHER_CITY}>Other (type it in)</option>
      </select>
      {other && (
        <input
          className="detail-input"
          value={value}
          placeholder="City name"
          aria-label="City name"
          onChange={(e) => onChange(path, e.target.value)}
        />
      )}
    </>
  );
}

// Department and sub department dropdowns from the Department tab's list
// (GET /api/departments). The sub department list is the picked department's;
// a saved value missing from the list stays selectable so editing keeps it.
function DepartmentSelect({ path, value, onChange, departments }) {
  const names = departments.map((d) => d.name);
  const choices = value && !names.includes(value) ? [value, ...names] : names;
  return (
    <select className="detail-input" value={value} onChange={(e) => onChange(path, e.target.value)}>
      <option value="">{departments.length ? "Select…" : "No departments yet (add in Department tab)"}</option>
      {choices.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  );
}

function SubDepartmentSelect({ path, value, onChange, departments, department }) {
  const picked = departments.find((d) => d.name === department);
  const names = picked ? picked.subDepartments.map((s) => s.name) : [];
  const choices = value && !names.includes(value) ? [value, ...names] : names;
  const none = Boolean(department) && !choices.length;
  return (
    <select
      className="detail-input"
      value={value}
      disabled={!department || none}
      onChange={(e) => onChange(path, e.target.value)}
    >
      <option value="">{!department ? "Pick a department first" : none ? "No sub departments" : "Select…"}</option>
      {choices.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  );
}

// One input in the form; see SECTIONS for the field shape. locked shows the
// value without letting it change (the employee code while editing, PF and
// ESIC below the CTC limit); hint is a line under it saying why. lists holds
// the Department tab's departments and the draft's picked department.
function Field({ field, value, onChange, locked, hint, lists }) {
  const { label, path, type, options, wide, upper, initial, permanent, ...fieldProps } = field;
  const inputProps = locked ? { ...fieldProps, readOnly: true, autoFocus: false } : fieldProps;

  let control;
  if (type === "checkbox") {
    return (
      <label className="detail-row detail-row-wide ae-check">
        <input
          type="checkbox"
          checked={value === "Yes"}
          onChange={(e) => onChange(path, e.target.checked ? "Yes" : "No")}
        />
        <span>{label}</span>
      </label>
    );
  } else if (type === "city") {
    control = <CitySelect path={path} value={value} onChange={onChange} />;
  } else if (type === "department") {
    control = <DepartmentSelect path={path} value={value} onChange={onChange} departments={lists.departments} />;
  } else if (type === "subDepartment") {
    control = (
      <SubDepartmentSelect
        path={path}
        value={value}
        onChange={onChange}
        departments={lists.departments}
        department={lists.department}
      />
    );
  } else if (type === "select" || type === "yesno") {
    const choices = type === "yesno" ? ["Yes", "No"] : options;
    control = (
      <select
        className="detail-input"
        value={value}
        disabled={locked}
        onChange={(e) => onChange(path, e.target.value)}
      >
        <option value="">Select…</option>
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {choice}
          </option>
        ))}
      </select>
    );
  } else if (type === "textarea") {
    control = (
      <textarea
        className="detail-input"
        rows={3}
        value={value}
        onChange={(e) => onChange(path, e.target.value)}
        {...inputProps}
      />
    );
  } else {
    control = (
      <input
        className="detail-input"
        type={type || "text"}
        value={value}
        onChange={(e) => onChange(path, upper ? e.target.value.toUpperCase() : e.target.value)}
        {...inputProps}
      />
    );
  }

  return (
    <label className={`detail-row detail-row-edit${wide ? " detail-row-wide" : ""}`}>
      <span className="detail-label">
        {label}
        {field.required && <span className="field-required"> *</span>}
      </span>
      {control}
      {hint && <span className="ae-field-note">{hint}</span>}
    </label>
  );
}

// Add Employee page, and the same form opened from an Employees card's Edit
// button: with `employee`, it starts from that record, keeps its code, saves
// with PUT and hands the saved record to onSaved (onCancel goes back).
export default function AddEmployee({ onNavigate, employee, onSaved, onCancel }) {
  const editing = Boolean(employee);
  const [draft, setDraft] = useState(() => (editing ? withStatutoryRule(draftFrom(employee)) : emptyDraft()));
  // Monthly CTC follows yearly / 12 until the admin types their own figure; a
  // saved figure that differs from yearly / 12 counts as typed.
  const [monthlyTyped, setMonthlyTyped] = useState(
    () => editing && employee.monthlyCtc !== Math.round((employee.yearlyCtc ?? 0) / 12)
  );
  // At or above PF_ESIC_LIMIT, whether the admin has chosen PF / ESIC
  // themselves (a saved employee has); unchosen ones go back to blank when the
  // CTC rises past the limit.
  const [statutoryPicked, setStatutoryPicked] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(null); // { employeeId, name } of the last save
  // Bumped on Clear, so fields with their own state (the City dropdown) start over.
  const [formKey, setFormKey] = useState(0);
  // The Department tab's list, for the Department / Sub department dropdowns.
  const [departments, setDepartments] = useState([]);
  // Documents section: files saved on the server, and files picked that upload on save.
  const [savedDocs, setSavedDocs] = useState(() => employee?.documents || []);
  const [pendingDocs, setPendingDocs] = useState([]);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/departments")
      .then(({ data }) => !cancelled && setDepartments(data.departments || []))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function changeField(path, value) {
    if (path === "monthlyCtc") setMonthlyTyped(value !== "");
    if (path === "pfApplicable" || path === "esicApplicable") setStatutoryPicked(true);
    setDraft((prev) => {
      const next = { ...prev, [path]: value };
      // The sub department belongs to the department; a new department starts it over.
      if (path === "department" && value !== prev.department) next.subDepartment = "";
      // A listed city settles its state and country.
      for (const group of ["address", "permanentAddress"]) {
        if (path === `${group}.city` && STATE_OF_CITY[value]) {
          next[`${group}.state`] = STATE_OF_CITY[value];
          next[`${group}.country`] = "India";
        }
      }
      if (path === "yearlyCtc" && !monthlyTyped) {
        const yearly = Number(value);
        next.monthlyCtc = value !== "" && yearly >= 0 ? String(Math.round(yearly / 12)) : "";
      }
      if (path === "monthlyCtc" || path === "yearlyCtc") {
        if (belowPfEsicLimit(next.monthlyCtc)) return withStatutoryRule(next);
        if (!statutoryPicked) for (const key of STATUTORY_PATHS) next[key] = "";
      }
      return next;
    });
  }

  function clearForm() {
    setDraft(emptyDraft());
    setMonthlyTyped(false);
    setStatutoryPicked(false);
    setPendingDocs([]);
    setError("");
    setFormKey((key) => key + 1);
  }

  async function submit(e) {
    e.preventDefault();
    const kycMissing = missingKyc(savedDocs, pendingDocs);
    if (kycMissing.length) {
      setSaved(null);
      setError(`Upload the KYC documents first: ${kycMissing.join(", ")}`);
      document.getElementById("ae-documents")?.scrollIntoView({ block: "start" });
      return;
    }
    setSaving(true);
    setError("");
    setSaved(null);
    try {
      if (editing) {
        const { data } = await api.put(`/employees/${employee.employeeId}`, toRecord(draft));
        const { uploaded, failed } = await uploadDocuments(data.employeeId, pendingDocs);
        data.documents = [...(data.documents || []), ...uploaded];
        if (failed.length) {
          // Keep the form open so the failed files can be tried again.
          setSavedDocs(data.documents);
          setPendingDocs((list) => list.filter((p) => failed.some((f) => f.startsWith(`${p.file.name}:`))));
          setError(`Details saved, but some documents did not upload: ${failed.join("; ")}`);
          window.scrollTo(0, 0);
          return;
        }
        onSaved(data);
        return;
      }
      const { data } = await api.post("/employees", toRecord(draft));
      const { failed } = await uploadDocuments(data.employeeId, pendingDocs);
      setSaved({ employeeId: data.employeeId, name: data.name });
      clearForm();
      if (failed.length) {
        setError(`Employee saved, but some documents did not upload (add them from Edit): ${failed.join("; ")}`);
      }
      window.scrollTo(0, 0);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
      window.scrollTo(0, 0);
    } finally {
      setSaving(false);
    }
  }

  // A department with no sub departments leaves that field with nothing to
  // pick, so it counts as done.
  const pickedDepartment = departments.find((d) => d.name === draft.department);
  const subOptional = Boolean(draft.department) && (!pickedDepartment || !pickedDepartment.subDepartments.length);
  const sameAsCurrent = draft.permanentSameAsCurrent === "Yes";
  const filledIn = (section) =>
    section.fields.filter(
      (field) =>
        draft[field.path].trim() ||
        (field.path === "subDepartment" && subOptional) ||
        field.type === "checkbox" || // a tick box is an answer either way
        (field.permanent && sameAsCurrent) // copied from the current address
    ).length;
  const docCount = savedDocs.length + pendingDocs.length;
  const kycDone = docCount > 0;
  const filled = SECTIONS.reduce((sum, section) => sum + filledIn(section), 0);

  return (
    <form className="ae" onSubmit={submit}>
      <datalist id="reporting-managers">
        {REPORTING.map((row) => (
          <option key={row.code} value={row.name} />
        ))}
      </datalist>
      <div className="page-header">
        <div>
          <h1 className="page-title">{editing ? `Edit ${employee.name}` : "Add Employee"}</h1>
          <p className="page-subtitle">
            {editing
              ? `Employee ${employee.employeeId}. Change any detail and save; the salary split is worked out again.`
              : "New joiner's details, as on the HR joining sheet. Only employee code and name are required."}
          </p>
        </div>
      </div>

      {saved && (
        <div className="detail-banner" role="status">
          <span>
            Employee {saved.employeeId} ({saved.name}) saved.
          </span>
          <button type="button" className="btn" onClick={() => onNavigate("employees")}>
            View in Employees
          </button>
        </div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
        </div>
      )}

      {!editing && <BulkEmployeeUpload fields={FIELDS} departments={departments} onNavigate={onNavigate} />}

      <datalist id="add-emp-relations">
        {RELATIONS.map((relation) => (
          <option key={relation} value={relation} />
        ))}
      </datalist>

      <div className="ae-layout">
        {/* Section list: jumps to a section and shows how much of each is done. */}
        <nav className="ae-steps" aria-label="Form sections">
          {SECTIONS.map((section, i) => {
            const done = filledIn(section);
            const complete = done === section.fields.length;
            return (
              <a
                key={section.id}
                href={`#ae-${section.id}`}
                className={`ae-step${complete ? " is-done" : ""}`}
                // Scroll without putting the anchor in the address bar.
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(`ae-${section.id}`)?.scrollIntoView({ block: "start" });
                }}
              >
                <span className="ae-step-num" aria-hidden="true">
                  {complete ? "✓" : i + 1}
                </span>
                <span className="ae-step-text">
                  <span className="ae-step-title">{section.title}</span>
                  <span className="ae-step-count">
                    {done} of {section.fields.length}
                  </span>
                </span>
              </a>
            );
          })}
          <a
            href="#ae-documents"
            className={`ae-step${kycDone ? " is-done" : ""}`}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById("ae-documents")?.scrollIntoView({ block: "start" });
            }}
          >
            <span className="ae-step-num" aria-hidden="true">
              {kycDone ? "✓" : SECTIONS.length + 1}
            </span>
            <span className="ae-step-text">
              <span className="ae-step-title">Documents</span>
              <span className="ae-step-count">
                {docCount ? `${docCount} file${docCount > 1 ? "s" : ""}` : "Optional"}
              </span>
            </span>
          </a>
        </nav>

        <div className="ae-sections" key={formKey}>
          {SECTIONS.map((section, i) => (
            <section key={section.id} id={`ae-${section.id}`} className="card ae-card">
              <header className="ae-card-head">
                <span className="ae-card-num" aria-hidden="true">
                  {i + 1}
                </span>
                <div>
                  <h2 className="ae-card-title">{section.title}</h2>
                  <p className="ae-card-note">{section.note}</p>
                </div>
              </header>
              <div className="ae-grid">
                {section.fields.filter((field) => !(field.permanent && sameAsCurrent)).map((field) => (
                  <Field
                    key={field.path}
                    field={field}
                    value={draft[field.path]}
                    onChange={changeField}
                    lists={{ departments, department: draft.department, subOptional }}
                    locked={
                      (editing && field.path === "employeeId") ||
                      (STATUTORY_PATHS.includes(field.path) && belowPfEsicLimit(draft.monthlyCtc))
                    }
                    hint={
                      STATUTORY_PATHS.includes(field.path) && belowPfEsicLimit(draft.monthlyCtc)
                        ? "Always Yes: monthly CTC is below ₹25,500."
                        : undefined
                    }
                  />
                ))}
              </div>
              {section.id === "pay" && <SalaryBreakdown draft={draft} />}
            </section>
          ))}
          <section id="ae-documents" className="card ae-card">
            <header className="ae-card-head">
              <span className="ae-card-num" aria-hidden="true">
                {SECTIONS.length + 1}
              </span>
              <div>
                <h2 className="ae-card-title">Documents</h2>
                <p className="ae-card-note">Aadhaar, PAN, bank proof and other papers, as PDF, JPG or PNG.</p>
              </div>
            </header>
            <EmployeeDocuments
              employeeId={employee?.employeeId}
              employeeCode={draft.employeeId.trim()}
              employeeName={draft.name}
              saved={savedDocs}
              onSavedChange={setSavedDocs}
              pending={pendingDocs}
              onPendingChange={setPendingDocs}
            />
          </section>
        </div>
      </div>

      {/* Always in reach while scrolling the long form. */}
      <div className="ae-bar">
        <div className="ae-progress">
          <span className="ae-progress-text">
            {filled} of {FIELDS.length} fields filled
          </span>
          <span className="ae-progress-track" aria-hidden="true">
            <span className="ae-progress-fill" style={{ width: `${(filled / FIELDS.length) * 100}%` }} />
          </span>
        </div>
        <div className="ae-bar-actions">
          <button
            type="button"
            className="btn"
            onClick={editing ? onCancel : clearForm}
            disabled={saving}
          >
            {editing ? "Cancel" : "Clear"}
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving && <span className="spinner" aria-hidden="true" />}
            {saving ? "Saving…" : editing ? "Save changes" : "Save employee"}
          </button>
        </div>
      </div>
    </form>
  );
}
