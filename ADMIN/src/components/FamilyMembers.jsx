import { FAMILY_PARENT_AGE, ageOn, familyEsicCovered } from "@salary";

// Add Employee > Family step: father, mother, spouse and any children, and
// whom ESIC covers (rule in server/utils/salaryFormulas.js: parents older than
// 60, spouse and children always). A row counts once it has a name. The PF
// nomination is its own step (PfNominees.jsx). Dates here are YYYY-MM-DD
// (date input); the page saves DD-MM-YYYY.

const isoToDmy = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
};
const dmyToIso = (dmy) => {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dmy || "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
};

const LABELS = { Father: "Father", Mother: "Mother", Spouse: "Wife / husband", Child: "Child" };

const blankRow = (relation) => ({ relation, name: "", dob: "" });

// Fresh rows: one each for father, mother and spouse; children are added.
export function emptyFamily() {
  return ["Father", "Mother", "Spouse"].map(blankRow);
}

// A saved employee's family back into rows (always with the three fixed ones).
export function familyFrom(saved) {
  const rows = (saved || []).map((m) => ({ relation: m.relation, name: m.name || "", dob: dmyToIso(m.dob) }));
  for (const relation of ["Spouse", "Mother", "Father"]) {
    if (!rows.some((r) => r.relation === relation)) rows.unshift(blankRow(relation));
  }
  const order = { Father: 0, Mother: 1, Spouse: 2, Child: 3 };
  return rows.sort((a, b) => order[a.relation] - order[b.relation]);
}

// Rows with a name, as the server takes them.
export function familyRecord(rows) {
  return rows
    .filter((r) => r.name.trim())
    .map((r) => ({ relation: r.relation, name: r.name.trim(), dob: isoToDmy(r.dob) }));
}

export const familyCount = (rows) => rows.filter((r) => r.name.trim()).length;

// Family step: who is in the family and whom ESIC covers.
export default function FamilyMembers({ rows, onChange, esicApplicable }) {
  const esic = esicApplicable === "Yes";
  const today = new Date().toISOString().slice(0, 10);

  const update = (index, key, value) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)));

  return (
    <div className="ae-family">
      <p className="ae-family-rule">
        {esic
          ? `ESIC covers father and mother above ${FAMILY_PARENT_AGE} years, and wife / husband and children always.`
          : "ESIC applicable is not Yes for this employee (Joining & pay step), so no family member is covered."}
      </p>
      <div className="ae-family-table" role="table">
        <div className="ae-family-row ae-family-head" role="row">
          <span role="columnheader">Relation</span>
          <span role="columnheader">Name</span>
          <span role="columnheader">Date of birth</span>
          <span role="columnheader">Age</span>
          <span role="columnheader">ESIC cover</span>
          <span aria-hidden="true" />
        </div>
        {rows.map((row, i) => {
          const dob = isoToDmy(row.dob);
          const age = ageOn(dob);
          const hasName = Boolean(row.name.trim());
          const covered = familyEsicCovered({ ...row, dob }, esic);
          const parent = row.relation === "Father" || row.relation === "Mother";
          let cover = "—";
          if (hasName) cover = covered ? "Yes" : "No";
          const why =
            hasName && esic && parent && !covered
              ? age == null
                ? "Add date of birth"
                : `${FAMILY_PARENT_AGE} or under`
              : "";
          return (
            <div className="ae-family-row" role="row" key={i}>
              <span className="ae-family-rel" role="cell">
                {LABELS[row.relation]}
              </span>
              <input
                className="detail-input"
                role="cell"
                aria-label={`${LABELS[row.relation]} name`}
                placeholder="Name (leave blank if none)"
                value={row.name}
                onChange={(e) => update(i, "name", e.target.value)}
              />
              <input
                className="detail-input"
                role="cell"
                type="date"
                max={today}
                aria-label={`${LABELS[row.relation]} date of birth`}
                value={row.dob}
                onChange={(e) => update(i, "dob", e.target.value)}
              />
              <span className="ae-family-age" role="cell">
                {age == null ? "—" : age}
              </span>
              <span role="cell">
                <span className={`ae-family-cover${cover === "Yes" ? " is-yes" : ""}`}>{cover}</span>
                {why && <span className="ae-field-note">{why}</span>}
              </span>
              <span role="cell">
                {row.relation === "Child" && (
                  <button
                    type="button"
                    className="btn ae-family-remove"
                    aria-label="Remove this child"
                    onClick={() => onChange(rows.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <button type="button" className="btn" onClick={() => onChange([...rows, blankRow("Child")])}>
        + Add child
      </button>
    </div>
  );
}

