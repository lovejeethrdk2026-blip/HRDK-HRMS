// Users page (Add / Edit user): tick one or more departments, and inside each
// ticked department pick sub departments. No sub department picked = the
// whole department.
//   options: [{ name: "CASTING DEPARTMENT", subs: ["WAX", "POLISH"] }]
//   value:   [{ name: "CASTING DEPARTMENT", subs: ["WAX"] }]
export default function DepartmentPicker({ id, label, options, value, onChange, subLabel = "sub departments", emptyText }) {
  const picked = (name) => value.find((v) => v.name === name);

  function toggleDepartment(name) {
    onChange(picked(name) ? value.filter((v) => v.name !== name) : [...value, { name, subs: [] }]);
  }

  function toggleSub(name, sub) {
    onChange(
      value.map((v) =>
        v.name !== name ? v : { ...v, subs: v.subs.includes(sub) ? v.subs.filter((s) => s !== sub) : [...v.subs, sub] }
      )
    );
  }

  return (
    <fieldset className="dp" aria-labelledby={`${id}-label`}>
      <legend id={`${id}-label`} className="dept-modal-label dp-legend">
        {label}
        {value.length > 0 && <span className="dp-count">{value.length} selected</span>}
      </legend>
      <div className="dp-box">
        {options.length === 0 && <p className="dp-empty">{emptyText || "No departments yet."}</p>}
        {options.map((option, index) => {
          const pick = picked(option.name);
          const boxId = `${id}-${index}`;
          return (
            <div key={option.name} className={`dp-row${pick ? " is-on" : ""}`}>
              <label className="dp-dept" htmlFor={boxId}>
                <input id={boxId} type="checkbox" checked={Boolean(pick)} onChange={() => toggleDepartment(option.name)} />
                <span className="dp-name">{option.name}</span>
                {pick && option.subs.length > 0 && (
                  <span className="dp-hint">
                    {pick.subs.length ? `${pick.subs.length} of ${option.subs.length}` : `All ${subLabel}`}
                  </span>
                )}
              </label>
              {pick && option.subs.length > 0 && (
                <div className="dp-subs" role="group" aria-label={`${option.name} ${subLabel}`}>
                  {option.subs.map((sub) => (
                    <button
                      key={sub}
                      type="button"
                      className="dp-chip"
                      aria-pressed={pick.subs.includes(sub)}
                      onClick={() => toggleSub(option.name, sub)}
                    >
                      {sub}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
