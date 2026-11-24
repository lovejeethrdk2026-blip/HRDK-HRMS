import { useEffect, useRef, useState } from "react";
import api from "../api/axios";
import { isActive } from "../utils/employeeStatus";
import { COUNTRIES, STATES } from "../data/places";
import DISTRICTS_BY_STATE from "../data/districts";
import { Country, State } from "country-state-city";
import BulkEmployeeUpload from "../components/BulkEmployeeUpload";
import SalarySplit from "../components/SalarySplit";
import EmployeeDocuments, { missingKyc, uploadDocuments } from "../components/EmployeeDocuments";
import FamilyMembers, { emptyFamily, familyCount, familyFrom, familyRecord } from "../components/FamilyMembers";
import PfNominees, { nomineesFrom, nomineesRecord, pfShareTotal } from "../components/PfNominees";
import { salaryStructure } from "@salary";

// Employees > Add Employee, laid out like the HR joining sheet. Posts to
// POST /api/employees (server/employee/employee.controller.js).

const WEEK_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Fields kept as DD-MM-YYYY but picked with a date input (YYYY-MM-DD).
const DATE_PATHS = new Set(["joiningDate", "confirmationDate"]);

// Salutation <-> gender (server/employee/employee.controller.js checks the same list).
const SALUTATIONS = ["Mr.", "Ms.", "Mrs.", "Mx."];
const SALUTATIONS_BY_GENDER = { Male: ["Mr."], Female: ["Ms.", "Mrs."], Other: ["Mx."] };
const GENDER_OF_SALUTATION = { "Mr.": "Male", "Ms.": "Female", "Mrs.": "Female", "Mx.": "Other" };

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
      // Salutation and gender go together: picking one narrows / fills the other.
      { label: "Salutation", path: "salutation", type: "salutation" },
      { label: "Employee name", path: "name", required: true },
      { label: "Gender", path: "gender", type: "select", options: ["Male", "Female", "Other"] },
      { label: "Department", path: "department", type: "department" },
      { label: "Sub department", path: "subDepartment", type: "subDepartment" },
      { label: "Designation", path: "designation" },
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
    note: "ID proofs and phone.",
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
    ]
  },
  {
    id: "emergency",
    title: "Emergency contact",
    note: "Whom to call in an emergency. Pick a family member below to fill it in.",
    fields: [
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
    note: "Where the employee lives.",
    fields: [
      { label: "Address", path: "address.line", type: "textarea", wide: true },
      { label: "Country", path: "address.country", type: "country", initial: "India" },
      { label: "State", path: "address.state", type: "state" },
      { label: "District", path: "address.district", type: "district", hidden: true },
      { label: "City", path: "address.city", type: "city" },
      { label: "PIN code", path: "address.pin", type: "pin", inputMode: "numeric", maxLength: 6, pattern: "\\d{6}", title: "6 digits" },
      { label: "Permanent address same as current address", path: "permanentSameAsCurrent", type: "checkbox", wide: true, hidden: true },
      // hidden: kept off the form but still in the
      // draft, so saved values survive an edit and the bulk upload keeps them.
      // permanent: hidden while the tick box is ticked; toRecord copies these.
      { label: "Permanent address", path: "permanentAddress.line", type: "textarea", wide: true, permanent: true, hidden: true },
      { label: "City", path: "permanentAddress.city", type: "city", permanent: true, hidden: true },
      { label: "District", path: "permanentAddress.district", type: "district", permanent: true, hidden: true },
      { label: "State", path: "permanentAddress.state", type: "select", options: STATES, permanent: true, hidden: true },
      {
        label: "PIN code",
        path: "permanentAddress.pin",
        inputMode: "numeric",
        maxLength: 6,
        pattern: "\\d{6}",
        title: "6 digits",
        permanent: true,
        hidden: true
      },
      {
        label: "Country",
        path: "permanentAddress.country",
        type: "select",
        options: COUNTRIES,
        initial: "India",
        permanent: true,
        hidden: true
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
  }
  // Shift is not on this form: it is given on Employees > Shift (BulkShift.jsx).
];

const FIELDS = SECTIONS.flatMap((section) => section.fields);

// Fields shown on the form (hidden ones stay in the draft only).
const visibleFields = (section) => section.fields.filter((field) => !field.hidden);
const SHOWN_COUNT = SECTIONS.reduce((sum, section) => sum + visibleFields(section).length, 0);

// Wizard order: Address second, then the rest of the SECTIONS with Family after
// Personal information, then Documents.
const STEPS = ["employee", "address", "pay", "personal", "family", "emergency", "nominee", "bank", "documents"];

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
    for (const key of ["line", "city", "district", "state", "pin", "country"]) {
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

// Country and State dropdowns from the country-state-city package: every
// country, and the states of the picked one. Saved as names ("India",
// "Rajasthan"). A saved name missing from the list stays selectable.
const COUNTRY_NAMES = Country.getAllCountries().map((c) => c.name);
const COUNTRY_CODE = Object.fromEntries(Country.getAllCountries().map((c) => [c.name, c.isoCode]));
const statesOf = (country) => State.getStatesOfCountry(COUNTRY_CODE[country] || "").map((s) => s.name);

function NameSelect({ path, value, onChange, names, empty = "Select…", disabled }) {
  const choices = value && !names.includes(value) ? [value, ...names] : names;
  return (
    <select className="detail-input" value={value} disabled={disabled} onChange={(e) => onChange(path, e.target.value)}>
      <option value="">{empty}</option>
      {choices.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  );
}

// District dropdown: the districts of the State picked beside it, plus
// "Other" for one not listed (typed in below). Empty until a state is picked;
// a saved district missing from the list opens as "Other".
function DistrictSelect({ path, value, onChange, state }) {
  const districts = DISTRICTS_BY_STATE[state] || [];
  const [other, setOther] = useState(value !== "" && !districts.includes(value));
  const showOther = other || (value !== "" && !districts.includes(value));
  return (
    <>
      <select
        className="detail-input"
        value={showOther ? OTHER_CITY : value}
        disabled={!state}
        onChange={(e) => {
          const picked = e.target.value;
          setOther(picked === OTHER_CITY);
          onChange(path, picked === OTHER_CITY ? "" : picked);
        }}
      >
        <option value="">{state ? "Select…" : "Pick a state first"}</option>
        {districts.map((district) => (
          <option key={district} value={district}>
            {district}
          </option>
        ))}
        {state && <option value={OTHER_CITY}>Other (type it in)</option>}
      </select>
      {showOther && (
        <input
          className="detail-input"
          value={value}
          placeholder="District name"
          aria-label="District name"
          onChange={(e) => onChange(path, e.target.value)}
        />
      )}
    </>
  );
}

// City dropdown: the cities of the picked State from the country-state-city
// package (it has no district data, so the whole state is listed, with towns
// named like the picked District first), plus "Other" to type one in. The
// package's city data is large, so it loads only when this dropdown shows.
let cityModule = null;
const loadCities = () => (cityModule ??= import("country-state-city/lib/city").then((m) => m.default));

function CitySelect({ path, value, onChange, country, state, district }) {
  const [cities, setCities] = useState(null); // null while loading
  const [other, setOther] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const countryCode = COUNTRY_CODE[country];
    const stateCode = State.getStatesOfCountry(countryCode || "").find((s) => s.name === state)?.isoCode;
    if (!countryCode || !stateCode) {
      setCities([]);
      return undefined;
    }
    setCities(null);
    loadCities()
      .then((City) => !cancelled && setCities(City.getCitiesOfState(countryCode, stateCode).map((c) => c.name)))
      .catch(() => !cancelled && setCities([]));
    return () => {
      cancelled = true;
    };
  }, [country, state]);

  const key = district.trim().toLowerCase();
  const near = key ? (cities || []).filter((c) => c.toLowerCase().startsWith(key)) : [];
  const rest = (cities || []).filter((c) => !near.includes(c));
  const listed = (cities || []).includes(value);
  const showOther = other || (value !== "" && cities !== null && !listed);
  const option = (city) => (
    <option key={city} value={city}>
      {city}
    </option>
  );

  if (state && cities && !cities.length && country !== "India") {
    // No cities in the package for this state: type it in.
    return <input className="detail-input" value={value} onChange={(e) => onChange(path, e.target.value)} />;
  }
  return (
    <>
      <select
        className="detail-input"
        value={showOther ? OTHER_CITY : value}
        disabled={!state || cities === null}
        onChange={(e) => {
          const picked = e.target.value;
          setOther(picked === OTHER_CITY);
          onChange(path, picked === OTHER_CITY ? "" : picked);
        }}
      >
        <option value="">{!state ? "Pick a state first" : cities === null ? "Loading cities…" : "Select…"}</option>
        {near.length > 0 ? (
          <>
            <optgroup label={`${district} district`}>{near.map(option)}</optgroup>
            <optgroup label={`Other cities in ${state}`}>{rest.map(option)}</optgroup>
          </>
        ) : (
          rest.map(option)
        )}
        {state && <option value={OTHER_CITY}>Other (type it in)</option>}
      </select>
      {showOther && (
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

// PIN code dropdown: the picked City's post offices and their PINs, from the
// free India Post API (api.postalpincode.in; only the city name is sent).
// It finds offices by name, so the list keeps those in the picked State whose
// name has the city in it, one line per PIN. "Other" (or no internet, or no
// match) lets the PIN be typed in.
const pinCache = {};
const plain = (text) => String(text || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();

function loadPins(city, state) {
  const key = `${city}|${state}`;
  pinCache[key] ??= fetch(`https://api.postalpincode.in/postoffice/${encodeURIComponent(city)}`)
    .then((r) => r.json())
    .then((data) => {
      // The city as a whole word of the office name ("Jaipur City", not "Bijaipur").
      const word = ` ${plain(city)} `;
      const found = (data?.[0]?.PostOffice || []).filter(
        (o) => plain(o.State) === plain(state) && ` ${plain(o.Name)} `.includes(word) && /^\d{6}$/.test(o.Pincode)
      );
      // A city with its own district keeps that district's offices only
      // (Jodhpur, not "Jodhpur Khurd" in Udaipur district).
      const inDistrict = found.filter((o) => plain(o.District) === plain(city));
      const offices = inDistrict.length ? inDistrict : found;
      const byPin = {};
      for (const o of offices) (byPin[o.Pincode] ??= []).push(o.Name.trim());
      return Object.entries(byPin)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([pin, names]) => ({ pin, names }));
    })
    .catch(() => {
      delete pinCache[key]; // try again next time
      return [];
    });
  return pinCache[key];
}

function PinSelect({ path, value, onChange, city, state, country, inputProps }) {
  const [pins, setPins] = useState(null); // null while loading
  const [other, setOther] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!city || !state || country !== "India") {
      setPins([]);
      return undefined;
    }
    setPins(null);
    loadPins(city, state).then((list) => !cancelled && setPins(list));
    return () => {
      cancelled = true;
    };
  }, [city, state, country]);

  const typed = (
    <input
      className="detail-input"
      value={value}
      placeholder="6 digit PIN"
      onChange={(e) => onChange(path, e.target.value)}
      {...inputProps}
    />
  );
  // No city yet, outside India, or nothing found: type it in.
  if (!city || country !== "India" || (pins && !pins.length)) return typed;

  const listed = (pins || []).some((p) => p.pin === value);
  const showOther = other || (value !== "" && pins !== null && !listed);
  return (
    <>
      <select
        className="detail-input"
        value={showOther ? OTHER_CITY : value}
        disabled={pins === null}
        onChange={(e) => {
          const picked = e.target.value;
          setOther(picked === OTHER_CITY);
          onChange(path, picked === OTHER_CITY ? "" : picked);
        }}
      >
        <option value="">{pins === null ? "Loading PIN codes…" : "Select…"}</option>
        {(pins || []).map(({ pin, names }) => (
          <option key={pin} value={pin}>
            {pin} — {names.slice(0, 3).join(", ")}
            {names.length > 3 ? ` +${names.length - 3} more` : ""}
          </option>
        ))}
        <option value={OTHER_CITY}>Other (type it in)</option>
      </select>
      {showOther && typed}
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
    const group = path.replace(/\.city$/, "");
    control = (
      <CitySelect
        path={path}
        value={value}
        onChange={onChange}
        country={lists.draft?.[`${group}.country`] || ""}
        state={lists.draft?.[`${group}.state`] || ""}
        district={lists.draft?.[`${group}.district`] || ""}
      />
    );
  } else if (type === "pin") {
    const group = path.replace(/\.pin$/, "");
    control = (
      <PinSelect
        path={path}
        value={value}
        onChange={onChange}
        city={lists.draft?.[`${group}.city`] || ""}
        state={lists.draft?.[`${group}.state`] || ""}
        country={lists.draft?.[`${group}.country`] || ""}
        inputProps={inputProps}
      />
    );
  } else if (type === "country") {
    control = <NameSelect path={path} value={value} onChange={onChange} names={COUNTRY_NAMES} />;
  } else if (type === "state") {
    // address.state goes with address.country (permanentAddress likewise).
    const country = lists.draft?.[path.replace(/state$/, "country")] || "";
    const states = statesOf(country);
    control =
      country && !states.length ? (
        <input className="detail-input" value={value} onChange={(e) => onChange(path, e.target.value)} />
      ) : (
        <NameSelect
          path={path}
          value={value}
          onChange={onChange}
          names={states}
          empty={country ? "Select…" : "Pick a country first"}
          disabled={!country}
        />
      );
  } else if (type === "district" && (lists.draft?.[path.replace(/district$/, "country")] || "") !== "India") {
    // Districts are listed for India only; elsewhere it is typed in.
    control = <input className="detail-input" value={value} onChange={(e) => onChange(path, e.target.value)} />;
  } else if (type === "district") {
    // address.district goes with address.state, permanentAddress.district with permanentAddress.state.
    const state = lists.draft?.[path.replace(/district$/, "state")] || "";
    control = <DistrictSelect key={state} path={path} value={value} onChange={onChange} state={state} />;
  } else if (type === "salutation") {
    // Only the salutations that fit the picked gender (all when none picked).
    const choices = SALUTATIONS_BY_GENDER[lists.gender] || SALUTATIONS;
    control = (
      <select className="detail-input" value={value} onChange={(e) => onChange(path, e.target.value)}>
        <option value="">Select…</option>
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {choice}
          </option>
        ))}
      </select>
    );
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
  // Reporting manager suggestions: active employees in the employee master.
  const [managerNames, setManagerNames] = useState([]);
  useEffect(() => {
    let cancelled = false;
    api
      .get("/employees")
      .then(({ data }) => {
        if (cancelled || !Array.isArray(data)) return;
        const names = data
          .filter(isActive)
          .map((e) => String(e.name || "").replace(/\s+/g, " ").trim().toUpperCase())
          .filter(Boolean);
        setManagerNames([...new Set(names)].sort());
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
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
  const [appUnlocked, setAppUnlocked] = useState(() => employee?.appUnlockedDocs || []);
  const [pendingDocs, setPendingDocs] = useState([]);
  // Family step: father, mother, spouse and children (FamilyMembers rows).
  const [family, setFamily] = useState(() => (editing ? familyFrom(employee.family) : emptyFamily()));
  // PF nominee step: its own list (PfNominees rows).
  const [nominees, setNominees] = useState(() => (editing ? nomineesFrom(employee.pfNominees) : []));
  // Wizard: which step of STEPS is on screen. All steps stay rendered (hidden
  // ones with `hidden`) so typed values and field state survive moving between steps.
  const [step, setStep] = useState(0);
  const lastStep = STEPS.length - 1; // the Documents step
  const formRef = useRef(null);
  const stepIds = STEPS.map((id) => `ae-${id}`);

  function goTo(index) {
    setStep(index);
    formRef.current?.scrollIntoView({ block: "start" });
  }

  // First field the browser says is wrong inside `root`, if any.
  const firstInvalid = (root) => root?.querySelector("input:invalid, select:invalid, textarea:invalid");

  // Shows the step holding `el` and the browser's message on it.
  function showInvalid(el) {
    const index = stepIds.indexOf(el.closest(".ae-card")?.id);
    if (index >= 0) setStep(index);
    setTimeout(() => el.reportValidity(), 0);
  }

  function next() {
    const bad = firstInvalid(document.getElementById(stepIds[step]));
    if (bad) return showInvalid(bad);
    goTo(Math.min(step + 1, lastStep));
  }

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
      // Salutation fills the gender; a gender that does not fit the salutation clears it.
      if (path === "salutation" && GENDER_OF_SALUTATION[value]) next.gender = GENDER_OF_SALUTATION[value];
      if (path === "gender" && value && !(SALUTATIONS_BY_GENDER[value] || []).includes(prev.salutation)) {
        next.salutation = "";
      }
      // A new city starts its PIN code over.
      for (const group of ["address", "permanentAddress"]) {
        if (path === `${group}.city` && value !== prev[`${group}.city`]) next[`${group}.pin`] = "";
      }
      // A new country starts its state and district over.
      for (const group of ["address", "permanentAddress"]) {
        if (path === `${group}.country` && value !== prev[`${group}.country`]) {
          next[`${group}.state`] = "";
          next[`${group}.district`] = "";
          next[`${group}.city`] = "";
        }
      }
      // A new state starts its district over (unless the district is in it).
      for (const group of ["address", "permanentAddress"]) {
        if (path === `${group}.state` && value !== prev[`${group}.state`]) {
          next[`${group}.city`] = "";
          if (!(DISTRICTS_BY_STATE[value] || []).includes(prev[`${group}.district`])) next[`${group}.district`] = "";
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
    setFamily(emptyFamily());
    setNominees([]);
    setError("");
    setStep(0);
    setFormKey((key) => key + 1);
  }

  async function submit(e) {
    e.preventDefault();
    // Enter in a field before the last step moves on instead of saving.
    if (!editing && step < lastStep) return next();
    // Fields on other steps are checked here (the form has noValidate).
    const bad = firstInvalid(formRef.current);
    if (bad) return showInvalid(bad);
    const kycMissing = missingKyc(savedDocs, pendingDocs);
    if (kycMissing.length) {
      setSaved(null);
      setError(`Upload the KYC documents first: ${kycMissing.join(", ")}`);
      goTo(lastStep);
      return;
    }
    setSaving(true);
    setError("");
    setSaved(null);
    try {
      if (editing) {
        const { data } = await api.put(`/employees/${employee.employeeId}`, {
          ...toRecord(draft),
          family: familyRecord(family),
          pfNominees: nomineesRecord(nominees, employeeAddress)
        });
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
      const { data } = await api.post("/employees", {
        ...toRecord(draft),
        family: familyRecord(family),
        pfNominees: nomineesRecord(nominees, employeeAddress)
      });
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
    visibleFields(section).filter(
      (field) =>
        (draft[field.path] ?? "").trim() ||
        (field.path === "subDepartment" && subOptional) ||
        field.type === "checkbox" || // a tick box is an answer either way
        (field.permanent && sameAsCurrent) // copied from the current address
    ).length;
  const docCount = savedDocs.length + pendingDocs.length;
  const kycDone = docCount > 0;
  const filled = SECTIONS.reduce((sum, section) => sum + filledIn(section), 0);
  const members = familyCount(family);
  // The employee's current address on one line, for PF nominees living there too.
  const employeeAddress = ["line", "city", "district", "state", "pin", "country"]
    .map((key) => draft[`address.${key}`].trim())
    .filter(Boolean)
    .join(", ");

  // Side list title, count line and done tick for one step.
  function stepInfo(id) {
    if (id === "family") {
      return { title: "Family (ESIC)", count: members ? `${members} member${members > 1 ? "s" : ""}` : "Optional", complete: members > 0 };
    }
    if (id === "nominee") {
      const total = pfShareTotal(nominees);
      return {
        title: "PF nominee",
        count: nominees.length ? `${nominees.length} nominee${nominees.length > 1 ? "s" : ""}, ${total}%` : "Optional",
        complete: nominees.length > 0 && total === 100
      };
    }
    if (id === "documents") {
      return { title: "Documents", count: docCount ? `${docCount} file${docCount > 1 ? "s" : ""}` : "Optional", complete: kycDone };
    }
    const section = SECTIONS.find((s) => s.id === id);
    const done = filledIn(section);
    return { title: section.title, count: `${done} of ${visibleFields(section).length}`, complete: done === visibleFields(section).length };
  }

  return (
    <form className="ae" onSubmit={submit} noValidate ref={formRef}>
      <datalist id="reporting-managers">
        {managerNames.map((name) => (
          <option key={name} value={name} />
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
        {/* Step list: opens a step and shows how much of each is done. */}
        <nav className="ae-steps" aria-label="Form steps">
          {STEPS.map((id, i) => {
            const info = stepInfo(id);
            return (
              <a
                key={id}
                href={`#ae-${id}`}
                className={`ae-step${info.complete ? " is-done" : ""}${step === i ? " is-current" : ""}`}
                aria-current={step === i ? "step" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  goTo(i);
                }}
              >
                <span className="ae-step-num" aria-hidden="true">
                  {info.complete ? "✓" : i + 1}
                </span>
                <span className="ae-step-text">
                  <span className="ae-step-title">{info.title}</span>
                  <span className="ae-step-count">{info.count}</span>
                </span>
              </a>
            );
          })}
        </nav>

        <div className="ae-sections" key={formKey}>
          {SECTIONS.map((section) => {
            const i = STEPS.indexOf(section.id);
            return (
              <section key={section.id} id={`ae-${section.id}`} className="card ae-card" hidden={step !== i}>
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
                  {visibleFields(section).filter((field) => !(field.permanent && sameAsCurrent)).map((field) => (
                    <Field
                      key={field.path}
                      field={field}
                      value={draft[field.path]}
                      onChange={changeField}
                      lists={{ departments, department: draft.department, subOptional, gender: draft.gender, draft }}
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
                {/* Fill the emergency contact from someone on the Family step. */}
                {section.id === "emergency" && family.some((m) => m.name.trim()) && (
                  <div className="ae-nominee-add ae-emergency-pick">
                    {family
                      .filter((m) => m.name.trim())
                      .map((m) => (
                        <button
                          key={`${m.relation}-${m.name}`}
                          type="button"
                          className="btn"
                          onClick={() => {
                            changeField("emergencyContact.name", m.name.trim());
                            changeField("emergencyContact.relation", m.relation === "Child" ? "" : m.relation);
                          }}
                        >
                          Use {m.name.trim()} ({m.relation === "Spouse" ? "wife / husband" : m.relation.toLowerCase()})
                        </button>
                      ))}
                  </div>
                )}
              </section>
            );
          })}
          <section id="ae-family" className="card ae-card" hidden={step !== STEPS.indexOf("family")}>
            <header className="ae-card-head">
              <span className="ae-card-num" aria-hidden="true">
                {STEPS.indexOf("family") + 1}
              </span>
              <div>
                <h2 className="ae-card-title">Family (ESIC)</h2>
                <p className="ae-card-note">Father, mother, wife / husband and children, and whom ESIC covers.</p>
              </div>
            </header>
            <FamilyMembers rows={family} onChange={setFamily} esicApplicable={draft.esicApplicable} />
          </section>
          <section id="ae-nominee" className="card ae-card" hidden={step !== STEPS.indexOf("nominee")}>
            <header className="ae-card-head">
              <span className="ae-card-num" aria-hidden="true">
                {STEPS.indexOf("nominee") + 1}
              </span>
              <div>
                <h2 className="ae-card-title">PF nominee</h2>
                <p className="ae-card-note">Who gets the PF if the employee dies, their share, and their bank details.</p>
              </div>
            </header>
            <PfNominees
              nominees={nominees}
              onChange={setNominees}
              family={family}
              pfApplicable={draft.pfApplicable}
              employeeAddress={employeeAddress}
            />
          </section>
          <section id="ae-documents" className="card ae-card" hidden={step !== lastStep}>
            <header className="ae-card-head">
              <span className="ae-card-num" aria-hidden="true">
                {lastStep + 1}
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
              appUnlocked={appUnlocked}
              onAppUnlockedChange={setAppUnlocked}
            />
          </section>
        </div>
      </div>

      {/* Always in reach while scrolling the long form. */}
      <div className="ae-bar">
        <div className="ae-progress">
          <span className="ae-progress-text">
            {filled} of {SHOWN_COUNT} fields filled
          </span>
          <span className="ae-progress-track" aria-hidden="true">
            <span className="ae-progress-fill" style={{ width: `${(filled / SHOWN_COUNT) * 100}%` }} />
          </span>
        </div>
        <div className="ae-bar-actions">
          <span className="ae-step-of">
            Step {step + 1} of {lastStep + 1}
          </span>
          <button
            type="button"
            className="btn"
            onClick={editing ? onCancel : clearForm}
            disabled={saving}
          >
            {editing ? "Cancel" : "Clear"}
          </button>
          {step > 0 && (
            <button type="button" className="btn" onClick={() => goTo(step - 1)} disabled={saving}>
              Back
            </button>
          )}
          {step < lastStep && (
            <button type="button" className={`btn${editing ? "" : " btn-primary"}`} onClick={next} disabled={saving}>
              Next
            </button>
          )}
          {/* A new employee saves from the last step; an edit can save from any step. */}
          {(editing || step === lastStep) && (
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving && <span className="spinner" aria-hidden="true" />}
              {saving ? "Saving…" : editing ? "Save changes" : "Save employee"}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
