// Monthly salary split (see server/utils/salaryFormulas.js) laid out like a pay
// slip: earnings, the employee's deductions and the employer's contributions,
// each with its total, then the in-hand figure. Shown on the Add Employee form
// and on each Employees card.
const GROUPS = [
  {
    title: "Earnings",
    totalLabel: "Gross earnings",
    rows: [
      ["Basic salary", "basic"],
      ["HRA", "hra"],
      ["Special allowance", "specialAllowance"],
      ["Statutory bonus", "statutoryBonus"]
    ]
  },
  {
    title: "Deductions",
    totalLabel: "Total deductions",
    rows: [
      ["PF employee", "pfEmployee"],
      ["ESIC employee", "esicEmployee"],
      ["Professional Tax", "professionalTax"]
    ]
  },
  {
    title: "Employer contribution",
    totalLabel: "Total employer",
    rows: [
      ["PF employer", "pfEmployer"],
      ["ESIC employer", "esicEmployer"]
    ]
  }
];

export const rupees = (amount) =>
  `₹${Number(amount ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function SalarySplit({ salary }) {
  return (
    <div className="ss">
      <div className="ss-groups">
        {GROUPS.map((group) => {
          const total = group.rows.reduce((sum, [, key]) => sum + (salary[key] ?? 0), 0);
          return (
            <section key={group.title} className="ss-group">
              <h3 className="ss-group-title">{group.title}</h3>
              <dl className="ss-rows">
                {group.rows.map(([label, key]) => (
                  <div key={key} className="ss-row">
                    <dt>{label}</dt>
                    <dd>{rupees(salary[key])}</dd>
                  </div>
                ))}
                <div className="ss-row ss-row-total">
                  <dt>{group.totalLabel}</dt>
                  <dd>{rupees(total)}</dd>
                </div>
              </dl>
            </section>
          );
        })}
      </div>
      <div className="ss-net">
        <span className="ss-net-label">
          In hand
          <span className="ss-net-note">Gross earnings − deductions</span>
        </span>
        <span className="ss-net-value">{rupees(salary.inHand)}</span>
      </div>
    </div>
  );
}
