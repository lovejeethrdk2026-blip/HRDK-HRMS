import { useEffect, useRef } from "react";
import { ageOn } from "@salary";

// Add Employee > PF nominee step: who gets the employee's PF if they die, and
// how much (all shares together 100%). Each nominee is entered here in full:
// relation, name, date of birth, gender, share, Aadhaar, mobile, address,
// bank account and, for a minor, a guardian. Family members can be copied in
// with one click. Saved as `pfNominees` (server/employee/employee.controller.js
// checks the same rules). Dates here are YYYY-MM-DD (date input); the page
// saves DD-MM-YYYY.

export const NOMINEE_RELATIONS = ["Father", "Mother", "Wife", "Husband", "Son", "Daughter", "Brother", "Sister", "Other"];
const GENDERS = ["Male", "Female", "Other"];
const ADULT_AGE = 18;

const isoToDmy = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
};
const dmyToIso = (dmy) => {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dmy || "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
};

const blankNominee = (from = {}) => ({
  relation: "",
  name: "",
  dob: "",
  gender: "",
  pfShare: "",
  aadhaar: "",
  mobile: "",
  sameAddress: true,
  address: "",
  bankName: "",
  accountNo: "",
  ifscCode: "",
  guardianName: "",
  guardianRelation: "",
  ...from
});

// A saved employee's nominees back into form rows.
export function nomineesFrom(saved) {
  return (saved || []).map((n) =>
    blankNominee({
      relation: n.relation || "",
      name: n.name || "",
      dob: dmyToIso(n.dob),
      gender: n.gender || "",
      pfShare: n.pfShare ? String(n.pfShare) : "",
      aadhaar: n.aadhaar || "",
      mobile: n.mobile || "",
      sameAddress: n.sameAddress !== false,
      address: n.sameAddress === false ? n.address || "" : "",
      bankName: n.bank?.bankName || "",
      accountNo: n.bank?.accountNo || "",
      ifscCode: n.bank?.ifscCode || "",
      guardianName: n.guardian?.name || "",
      guardianRelation: n.guardian?.relation || ""
    })
  );
}

const shareOf = (n) => Number(n.pfShare) || 0;
export const pfShareTotal = (list) => Math.round(list.reduce((sum, n) => sum + shareOf(n), 0) * 100) / 100;

// Rows with a name, as the server takes them. employeeAddress is copied in for
// nominees marked "same as employee's address".
export function nomineesRecord(list, employeeAddress = "") {
  return list
    .filter((n) => n.name.trim())
    .map((n) => {
      const dob = isoToDmy(n.dob);
      const record = {
        relation: n.relation,
        name: n.name.trim(),
        dob,
        gender: n.gender,
        pfShare: shareOf(n),
        aadhaar: n.aadhaar.trim(),
        mobile: n.mobile.trim(),
        sameAddress: n.sameAddress,
        address: n.sameAddress ? employeeAddress : n.address.trim(),
        bank: { bankName: n.bankName.trim(), accountNo: n.accountNo.trim(), ifscCode: n.ifscCode.trim() }
      };
      const age = ageOn(dob);
      if (age != null && age < ADULT_AGE) {
        record.guardian = { name: n.guardianName.trim(), relation: n.guardianRelation.trim() };
      }
      return record;
    });
}

// Family step relation -> nominee relation (Spouse depends on gender, so it
// is left for the admin to pick).
const FROM_FAMILY = { Father: "Father", Mother: "Mother", Spouse: "", Child: "" };

function Field({ label, wide, children, required }) {
  return (
    <label className={`detail-row detail-row-edit${wide ? " detail-row-wide" : ""}`}>
      <span className="detail-label">
        {label}
        {required && <span className="field-required"> *</span>}
      </span>
      {children}
    </label>
  );
}

function Choice({ value, onChange, options, required }) {
  return (
    <select className="detail-input" value={value} required={required} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select…</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

export default function PfNominees({ nominees, onChange, family, pfApplicable, employeeAddress }) {
  const total = pfShareTotal(nominees);
  const boxRef = useRef(null);
  const today = new Date().toISOString().slice(0, 10);

  // Shares that do not add up to 100% make the share boxes invalid, so Next
  // and Save stop on this step with the message.
  useEffect(() => {
    const message = total !== 100 && nominees.length ? `PF shares must add up to 100% (now ${total}%)` : "";
    boxRef.current?.querySelectorAll("[data-share]").forEach((el) => el.setCustomValidity(message));
  }, [total, nominees]);

  const update = (index, key, value) =>
    onChange(nominees.map((n, i) => (i === index ? { ...n, [key]: value } : n)));

  // Family members (named on the Family step) not yet in the list.
  const addable = family.filter(
    (m) => m.name.trim() && !nominees.some((n) => n.name.trim().toLowerCase() === m.name.trim().toLowerCase())
  );

  return (
    <div className="ae-family" ref={boxRef}>
      <p className="ae-family-rule">
        Who gets the PF, and how much, if the employee dies. All shares together must make 100%, e.g. mother 50% and
        father 50%.
      </p>
      {pfApplicable !== "Yes" && (
        <p className="ae-field-note">PF applicable is not Yes on the Joining &amp; pay step; the nomination is still saved.</p>
      )}

      {nominees.length === 0 && <p className="ae-salary-empty">No nominees yet.</p>}

      {nominees.map((n, i) => {
        const dob = isoToDmy(n.dob);
        const age = ageOn(dob);
        const minor = age != null && age < ADULT_AGE;
        return (
          <div className="ae-nominee" key={i}>
            <div className="ae-nominee-head">
              <span className="ae-nominee-name">
                Nominee {i + 1}
                {n.name.trim() ? `: ${n.name.trim()}` : ""}
              </span>
              <span className="ae-nominee-tools">
                <span className={`ae-family-cover${shareOf(n) ? " is-yes" : ""}`}>{shareOf(n)}%</span>
                <button
                  type="button"
                  className="btn ae-family-remove"
                  onClick={() => onChange(nominees.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </span>
            </div>
            <div className="ae-grid">
              <Field label="Nominee name" required>
                <input
                  className="detail-input"
                  required
                  value={n.name}
                  onChange={(e) => update(i, "name", e.target.value)}
                />
              </Field>
              <Field label="Relation" required>
                <Choice
                  required
                  value={n.relation}
                  options={NOMINEE_RELATIONS}
                  onChange={(v) => update(i, "relation", v)}
                />
              </Field>
              <Field label="PF share %" required>
                <input
                  className="detail-input"
                  type="number"
                  min="0.01"
                  max="100"
                  step="0.01"
                  required
                  data-share=""
                  value={n.pfShare}
                  onChange={(e) => update(i, "pfShare", e.target.value)}
                />
              </Field>
              <Field label={`Date of birth${age != null ? ` (age ${age})` : ""}`}>
                <input
                  className="detail-input"
                  type="date"
                  max={today}
                  value={n.dob}
                  onChange={(e) => update(i, "dob", e.target.value)}
                />
              </Field>
              <Field label="Gender">
                <Choice value={n.gender} options={GENDERS} onChange={(v) => update(i, "gender", v)} />
              </Field>
              <Field label="Aadhaar no.">
                <input
                  className="detail-input"
                  inputMode="numeric"
                  maxLength={12}
                  pattern="\d{12}"
                  title="12 digits"
                  value={n.aadhaar}
                  onChange={(e) => update(i, "aadhaar", e.target.value)}
                />
              </Field>
              <Field label="Mobile no.">
                <input
                  className="detail-input"
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  pattern="\d{10}"
                  title="10 digits"
                  value={n.mobile}
                  onChange={(e) => update(i, "mobile", e.target.value)}
                />
              </Field>
              <label className="detail-row detail-row-wide ae-check">
                <input
                  type="checkbox"
                  checked={n.sameAddress}
                  onChange={(e) => update(i, "sameAddress", e.target.checked)}
                />
                <span>Address same as employee&apos;s address</span>
              </label>
              {n.sameAddress ? (
                employeeAddress && <p className="ae-field-note detail-row-wide">{employeeAddress}</p>
              ) : (
                <Field label="Address" wide>
                  <textarea
                    className="detail-input"
                    rows={2}
                    value={n.address}
                    onChange={(e) => update(i, "address", e.target.value)}
                  />
                </Field>
              )}
              <Field label="Bank name">
                <input className="detail-input" value={n.bankName} onChange={(e) => update(i, "bankName", e.target.value)} />
              </Field>
              <Field label="Bank account no.">
                <input
                  className="detail-input"
                  inputMode="numeric"
                  maxLength={18}
                  pattern="\d{6,18}"
                  title="6 to 18 digits"
                  value={n.accountNo}
                  onChange={(e) => update(i, "accountNo", e.target.value)}
                />
              </Field>
              <Field label="IFSC code">
                <input
                  className="detail-input"
                  maxLength={11}
                  pattern="[A-Z]{4}0[A-Z0-9]{6}"
                  title="Like SBIN0001234"
                  placeholder="SBIN0001234"
                  value={n.ifscCode}
                  onChange={(e) => update(i, "ifscCode", e.target.value.toUpperCase())}
                />
              </Field>
              {minor && (
                <>
                  <Field label="Guardian name (nominee is a minor)" required>
                    <input
                      className="detail-input"
                      required
                      value={n.guardianName}
                      onChange={(e) => update(i, "guardianName", e.target.value)}
                    />
                  </Field>
                  <Field label="Guardian's relation to nominee">
                    <input
                      className="detail-input"
                      list="add-emp-relations"
                      value={n.guardianRelation}
                      onChange={(e) => update(i, "guardianRelation", e.target.value)}
                    />
                  </Field>
                </>
              )}
            </div>
          </div>
        );
      })}

      <div className="ae-family-actions">
        <span className="ae-nominee-add">
          <button type="button" className="btn" onClick={() => onChange([...nominees, blankNominee()])}>
            + Add nominee
          </button>
          {addable.map((m) => (
            <button
              key={`${m.relation}-${m.name}`}
              type="button"
              className="btn"
              onClick={() =>
                onChange([
                  ...nominees,
                  blankNominee({ relation: FROM_FAMILY[m.relation] ?? "", name: m.name.trim(), dob: m.dob })
                ])
              }
            >
              + {m.name.trim()} (from Family)
            </button>
          ))}
        </span>
        {nominees.length > 0 && (
          <span className={`ae-family-total${total === 100 ? " is-ok" : " is-bad"}`}>
            PF share total: {total}%{total !== 100 ? " (must be 100%)" : ""}
          </span>
        )}
      </div>
    </div>
  );
}
