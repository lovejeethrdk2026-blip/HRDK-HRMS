import { departmentHistoryOf, payHistoryOf, salaryOn, sortableDate, stateHistoryOf, workSpans } from "@salary";
import { rupees } from "./SalarySplit";

// An Employees card's history boxes: month-wise payroll, and each salary,
// state or department change with the pay the day before it and on its effective date
// (server/utils/salaryFormulas.js salaryOn: that day's state, department and
// CTC).

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Months shown in the payroll table, up to the current one.
const MONTHS_SHOWN = 12;

const gross = (s) => s.basic + s.hra + s.specialAllowance + s.statutoryBonus;
const deductions = (s) => s.pfEmployee + s.esicEmployee + s.professionalTax;

// Breakdown rows: [label, amount of a split, kind]. "pay" rows are what the
// employee gets, so their change is coloured (green up, red down) and bold;
// "total" rows are only bold. A rise in a deduction is not good news, so the
// rest stay plain.
const BREAKDOWN = [
  ["Monthly CTC", (s) => s.monthlyCtc ?? 0, "pay"],
  ["Basic salary", (s) => s.basic],
  ["HRA", (s) => s.hra],
  ["Special allowance", (s) => s.specialAllowance],
  ["Statutory bonus", (s) => s.statutoryBonus],
  ["Gross earnings", gross, "pay"],
  ["PF employee", (s) => s.pfEmployee],
  ["ESIC employee", (s) => s.esicEmployee],
  ["Professional Tax", (s) => s.professionalTax],
  ["Total deductions", deductions, "total"],
  ["PF employer", (s) => s.pfEmployer],
  ["ESIC employer", (s) => s.esicEmployer],
  ["In hand", (s) => s.inHand, "pay"]
];

const place = (...parts) => parts.filter(Boolean).join(" · ") || "—";

// "+₹1,200" / "−₹200" / "—"; coloured only when asked.
function change(before, after, coloured) {
  const diff = Math.round((after - before) * 100) / 100;
  if (!diff) return <span className="ch-same">—</span>;
  const tone = coloured ? (diff > 0 ? "ch-up" : "ch-down") : undefined;
  return <span className={tone}>{`${diff > 0 ? "+" : "−"}${rupees(Math.abs(diff))}`}</span>;
}

// One change: what moved (facts: [label, before, after]) and the pay split
// before and after, side by side.
function ChangeCard({ title, date, remark, facts, before, after }) {
  return (
    <article className="ch-card">
      <header className="ch-card-head">
        <span className="ch-card-title">{title}</span>
        <span className="ch-card-date">From {date}</span>
      </header>
      {remark && <p className="ch-remark">{remark}</p>}
      <div className="table-scroll">
        <table className="st-table ch-table">
          <thead>
            <tr>
              <th />
              <th>Before</th>
              <th>After</th>
            </tr>
          </thead>
          <tbody>
            {facts.map(([label, was, now]) => (
              <tr key={label} className={was !== now ? "ch-moved" : undefined}>
                <th scope="row">{label}</th>
                <td>{was || "—"}</td>
                <td>{now || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-scroll">
        <table className="st-table ch-table">
          <thead>
            <tr>
              <th>Breakdown</th>
              <th className="st-num">Before</th>
              <th className="st-num">After</th>
              <th className="st-num">Change</th>
            </tr>
          </thead>
          <tbody>
            {BREAKDOWN.map(([label, amount, kind]) => (
              <tr key={label} className={kind ? "ch-total" : undefined}>
                <th scope="row">{label}</th>
                <td className="st-num">{rupees(amount(before))}</td>
                <td className="st-num">{rupees(amount(after))}</td>
                <td className="st-num">{change(amount(before), amount(after), kind === "pay")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

// Box with a title, a line under it and its changes, newest first.
function ChangeBox({ title, note, empty, cards }) {
  return (
    <section className="emp-box">
      <h3 className="emp-box-title">{title}</h3>
      <p className="emp-box-note">{note}</p>
      {cards.length ? <div className="ch-list">{[...cards].reverse()}</div> : <p className="ch-empty">{empty}</p>}
    </section>
  );
}

// Every state transfer: state and city before and after, and the pay split
// the day before and on the effective date.
export function StateChanges({ employee }) {
  const history = stateHistoryOf(employee);
  // A rejoin reopens the history; it is no transfer, so it gets no card.
  const cards = history.slice(1).flatMap((stay, i) => {
    if (stay.kind === "rejoin") return [];
    const was = history[i];
    const before = salaryOn(employee, was.to);
    const after = salaryOn(employee, stay.from);
    return (
      <ChangeCard
        key={stay.from}
        title={`${was.state || "—"} → ${stay.state || "—"}`}
        date={stay.from}
        remark={stay.remark}
        facts={[
          ["State", was.state, stay.state],
          ["City", was.city, stay.city],
          ["Department", place(before.department, before.subDepartment), place(after.department, after.subDepartment)]
        ]}
        before={before}
        after={after}
      />
    );
  });
  const first = history[0];
  return (
    <ChangeBox
      title="State changes"
      note="PT and the minimum wage follow the state, so the split changes with it."
      empty={`No state change yet. In ${first.state || "—"} since ${first.from || "joining"}.`}
      cards={cards}
    />
  );
}

// Every department transfer: department, sub department, designation,
// reporting manager and CTC before and after, and the pay split the day
// before and on the effective date.
export function DepartmentChanges({ employee }) {
  const history = departmentHistoryOf(employee);
  const cards = history.slice(1).flatMap((spell, i) => {
    if (spell.kind === "rejoin") return [];
    const was = history[i];
    const before = salaryOn(employee, was.to);
    const after = salaryOn(employee, spell.from);
    return (
      <ChangeCard
        key={spell.from}
        title={`${place(was.department, was.subDepartment)} → ${place(spell.department, spell.subDepartment)}`}
        date={spell.from}
        remark={spell.remark}
        facts={[
          ["Department", was.department, spell.department],
          ["Sub department", was.subDepartment, spell.subDepartment],
          ["Designation", before.designation, after.designation],
          ["Reporting manager", before.reportingManager, after.reportingManager],
          ["State", before.state, after.state]
        ]}
        before={before}
        after={after}
      />
    );
  });
  const first = history[0];
  return (
    <ChangeBox
      title="Department changes"
      note="A move may come with a new CTC; the split shows what it did to the pay."
      empty={`No department change yet. In ${place(first.department, first.subDepartment)} since ${first.from || "joining"}.`}
      cards={cards}
    />
  );
}

const KIND_LABELS = { revision: "Salary revision", department: "With a department transfer" };
const yesNo = (value) => (value ? "Yes" : "No");

// Every pay change (Salary revision, or a department transfer with a new
// CTC): CTC and PF / ESIC before and after, and the split the day before and
// on the effective date. Shown inside the Payroll box.
export function SalaryChanges({ employee }) {
  const history = payHistoryOf(employee);
  if (!history.slice(1).some((pay) => pay.kind !== "rejoin")) {
    return <p className="ch-empty">No salary revision yet. On {rupees(history.at(-1).monthlyCtc)} a month since {history[0].from || "joining"}.</p>;
  }
  const cards = history.slice(1).flatMap((pay, i) => {
    if (pay.kind === "rejoin") return [];
    const was = history[i];
    const before = salaryOn(employee, was.to);
    const after = salaryOn(employee, pay.from);
    const yearly = (ctc) => (ctc == null ? "" : rupees(ctc * 12));
    return (
      <ChangeCard
        key={pay.from}
        title={`${rupees(was.monthlyCtc)} → ${rupees(pay.monthlyCtc)} a month`}
        date={pay.from}
        remark={[KIND_LABELS[pay.kind], pay.remark].filter(Boolean).join(" · ")}
        facts={[
          ["Monthly CTC", rupees(was.monthlyCtc), rupees(pay.monthlyCtc)],
          ["Yearly CTC", yearly(was.monthlyCtc), yearly(pay.monthlyCtc)],
          ["PF applicable", yesNo(was.pfApplicable), yesNo(pay.pfApplicable)],
          ["ESIC applicable", yesNo(was.esicApplicable), yesNo(pay.esicApplicable)]
        ]}
        before={before}
        after={after}
      />
    );
  });
  return <div className="ch-list ch-list-wide">{cards.reverse()}</div>;
}

// [year, month, day] from the joining month to this month, the latest
// MONTHS_SHOWN. Each is [year, month, day]: day ("YYYY-MM-DD") is the month's last day on
// the rolls, whose pay the month shows (the last working day in the month
// they left). Months off the rolls between an exit and a rejoin, or after an
// exit, are left out.
export function monthsWorked(employee, shown = MONTHS_SHOWN) {
  const [year, month] = sortableDate(employee.joiningDate).split("-").map(Number);
  if (!year || !month) return [];
  const spans = workSpans(employee);
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const months = [];
  for (let y = year, m = month; y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1); ) {
    const first = `${y}-${pad(m)}-01`;
    const last = `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
    const day = spans
      .filter(({ from, to }) => from <= last && (!to || to >= first))
      .map(({ to }) => (!to || to > last ? last : to))
      .sort()
      .at(-1);
    if (day) months.push([y, m, day]);
    [y, m] = m === 12 ? [y + 1, 1] : [y, m + 1];
  }
  return months.slice(-shown);
}

// Each month's pay as it stood on the month's last day, newest first.
export function PayrollHistory({ employee }) {
  const months = monthsWorked(employee).reverse();
  if (!months.length) return <p className="ch-empty">No date of joining, so no months to show.</p>;
  return (
    <div className="table-scroll">
      <table className="st-table">
        <thead>
          <tr>
            <th>Month</th>
            <th>State</th>
            <th>Department</th>
            <th className="st-num">Monthly CTC</th>
            <th className="st-num">Gross</th>
            <th className="st-num">PF</th>
            <th className="st-num">ESIC</th>
            <th className="st-num">PT</th>
            <th className="st-num">In hand</th>
          </tr>
        </thead>
        <tbody>
          {months.map(([year, month, day]) => {
            const salary = salaryOn(employee, day);
            return (
              <tr key={`${year}-${month}`}>
                <td>
                  {MONTH_NAMES[month - 1]} {year}
                </td>
                <td>{salary.state || "—"}</td>
                <td>{place(salary.department, salary.subDepartment)}</td>
                <td className="st-num">{rupees(salary.monthlyCtc)}</td>
                <td className="st-num">{rupees(gross(salary))}</td>
                <td className="st-num">{rupees(salary.pfEmployee)}</td>
                <td className="st-num">{rupees(salary.esicEmployee)}</td>
                <td className="st-num">{rupees(salary.professionalTax)}</td>
                <td className="st-num">{rupees(salary.inHand)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
