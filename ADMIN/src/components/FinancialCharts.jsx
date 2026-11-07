import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

// Five charts under the Financial Summary boxes, from the same summary the
// boxes show (pages/FinancialSummary.jsx: blocks[0] is the Total, the rest one
// per posted month). The Excel dashboard (reports/build_payroll_dashboard.py)
// has these plus a head count chart. Trends use the monthly blocks only; the donut uses the
// Total. Amounts in Rs lakh.

const LAKH = 100000;
// Charts draw at once, without animation: an animation does not advance in a
// background tab, and the PDF must picture finished charts.
// Categorical palette in the app's own colours (teal and brass first, then
// plum, terracotta, blue, green), fixed order. Checked with the dataviz
// palette validator on the light card surface: lightness band, chroma floor,
// colour-blind and normal-vision separation of neighbours, 3:1 contrast all pass.
const PALETTE = ["#00918a", "#b27c14", "#8b4aa0", "#cc5a36", "#3a78c0", "#4d9846"];
const INK = "#051f20"; // --text
// Head count bars: a light tint of their group's colour (Wages blue, Salary orange).
const HEAD_COUNT_TINT = ["#8fcdc8", "#ddbf86"];
const MUTED = "#3f5c54"; // --text-muted
const GRID = "#e3efe5"; // --row-line

const COMPONENTS = [
  ["Basic Pay", "Basic Pay"],
  ["House Rent Allowance (HRA)", "HRA"],
  ["Special Allowance", "Special Allowance"],
  ["Bonus", "Bonus"],
  ["Incentives & Overtime", "Incentives & OT"],
  ["Other (Transport, Stipend, …)", "Other"]
];
const DEDUCTIONS = ["ESIC", "PF", "PTAX", "TDS on Salary", "Advance Recover"];
// In the deductions stack these are a few thousand rupees beside lakhs (1-2 px
// tall), so they are drawn at least this share of the month's bar, and the
// extra height is taken off TDS so the bar's total height is unchanged.
// The tooltip gives the real amounts.
const SMALL_DEDUCTIONS = ["ESIC", "PTAX"];
const MIN_SLICE = 0.06;
const shownKey = (label) => `${label} (shown)`;
// A deduction keeps its colour whatever its place in the order.
const deductionColour = (label) => PALETTE[DEDUCTIONS.indexOf(label)];

// Deductions smallest to largest by their total over the period: bottom to top
// in the stack and left to right in the legend.
function deductionsBySize(rows) {
  const total = (label) => rows.reduce((sum, row) => sum + (row.rupees[label] || 0), 0);
  return [...DEDUCTIONS].sort((a, b) => total(a) - total(b));
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const lakh = (amount) => Math.round((amount / LAKH) * 100) / 100;
const lakhText = (value) =>
  `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} L`;
const pctText = (value) => `${(value * 100).toFixed(1)}%`;

// A block's line by its label: { wages, salary, total }, zeros when absent.
function lineOf(block, label) {
  for (const section of block.sections) {
    const found = section.find((l) => l.label === label);
    if (found) return found;
  }
  return { wages: { amount: 0, count: 0 }, salary: { amount: 0, count: 0 }, total: 0 };
}

function monthRows(blocks) {
  return blocks.slice(1).map((block) => {
    const gross = lineOf(block, "Gross Salary");
    const row = {
      month: `${MONTHS[Number(block.month.slice(5, 7)) - 1]} ${block.month.slice(0, 4)}`,
      gross: lakh(gross.total),
      deductions: lakh(lineOf(block, "Total Deductions").total),
      net: lakh(lineOf(block, "Net Pay").total),
      wagesGross: lakh(gross.wages.amount),
      salaryGross: lakh(gross.salary.amount),
      wagesCount: gross.wages.count ?? 0,
      salaryCount: gross.salary.count ?? 0
    };
    row.headCount = row.wagesCount + row.salaryCount;
    for (const [label, key] of COMPONENTS) row[key] = lakh(lineOf(block, label).total);
    // Deductions also in full rupees: ESIC and PTAX are a few thousand a month,
    // too thin to see in a stack of lakhs, so they are tabled under the chart.
    row.rupees = {};
    for (const label of DEDUCTIONS) {
      row.rupees[label] = lineOf(block, label).total;
      row[label] = lakh(row.rupees[label]);
    }
    row.rupees.total = lineOf(block, "Total Deductions").total;
    // Heights to draw in the stack (see SMALL_DEDUCTIONS).
    const floor = row.deductions * MIN_SLICE;
    let lifted = 0;
    for (const label of DEDUCTIONS) {
      const shown = SMALL_DEDUCTIONS.includes(label) && row[label] > 0 ? Math.max(row[label], floor) : row[label];
      lifted += shown - row[label];
      row[shownKey(label)] = shown;
    }
    row[shownKey("TDS on Salary")] = Math.max(0, row["TDS on Salary"] - lifted);
    return row;
  });
}

const axisProps = { stroke: MUTED, tick: { fill: MUTED, fontSize: 12 }, tickLine: false };
// Room at both ends of a line chart, so the first and last labels clear the axes.
const lineXAxis = { ...axisProps, padding: { left: 28, right: 28 } };
// A round axis top above the largest value, in steps of `step`.
const niceMax = (step, headroom = 1.15) => (max) => Math.max(step, Math.ceil((max * headroom) / step) * step);
// Legend text in ink; the coloured dot beside it carries the series identity.
const legendText = (value) => <span style={{ color: INK }}>{value}</span>;
const lakhAxis = { ...axisProps, width: 48, tickFormatter: (v) => v.toLocaleString("en-IN") };
const legendProps = { iconType: "circle", iconSize: 9, wrapperStyle: { fontSize: 12 }, formatter: legendText };
const tooltipProps = {
  contentStyle: { borderRadius: 8, border: "1px solid #e2e3dc", fontSize: 12.5, boxShadow: "0 14px 34px -14px rgba(23,26,24,0.22)" },
  labelStyle: { color: INK, fontWeight: 700 },
  itemStyle: { color: INK }
};

// Percent inside its donut slice, white on the fill; none on slices too thin to hold it.
function sliceLabel(totalGross) {
  return ({ cx, cy, midAngle, innerRadius, outerRadius, value }) => {
    const share = value / totalGross;
    if (share < 0.04) return null;
    const r = (innerRadius + outerRadius) / 2;
    const angle = (-midAngle * Math.PI) / 180;
    return (
      <text x={cx + r * Math.cos(angle)} y={cy + r * Math.sin(angle)} textAnchor="middle"
        dominantBaseline="central" fontSize={12} fontWeight={700} fill="#fff">
        {pctText(share)}
      </text>
    );
  };
}

// One chart laid out like a slide of the Download PPT deck: a navy band and
// title, the chart on the left, and a side panel (stat cards, notes, ranked
// items) on the right.
function ChartCard({ title, note, side, after, children }) {
  return (
    <section className="card fc-card fc-slide">
      <header className="fc-card-head">
        <h3 className="fc-title">{title}</h3>
        {note && <p className="fc-note">{note}</p>}
      </header>
      <div className={`fc-card-body${side ? " fc-slide-body" : ""}`}>
        <div className="fc-slide-main">
          <div className="fc-plot">
            <ResponsiveContainer width="100%" height="100%">
              {children}
            </ResponsiveContainer>
          </div>
          {after}
        </div>
        {side && <aside className="fc-slide-side">{side}</aside>}
      </div>
    </section>
  );
}

// Side-panel pieces, as on the deck's slides.
function StatCards({ items }) {
  return (
    <div className="fc-stats">
      {items.map(({ value, label, tone }) => (
        <div key={label} className="fc-stat">
          <span className={`fc-stat-value is-${tone}`}>{value}</span>
          <span className="fc-stat-label">{label}</span>
        </div>
      ))}
    </div>
  );
}

function Note({ children }) {
  return <p className="fc-callout">{children}</p>;
}

function Ranked({ title, items }) {
  return (
    <div className="fc-ranked">
      <h4 className="fc-side-title">{title}</h4>
      {items.map(({ name, detail }, i) => (
        <div key={name} className="fc-ranked-item">
          <span className="fc-ranked-badge">{i + 1}</span>
          <span className="fc-ranked-text">
            <span className="fc-ranked-name">{name}</span>
            <span className="fc-ranked-detail">{detail}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function Bullets({ title, items }) {
  return (
    <div className="fc-bullets">
      <h4 className="fc-side-title">{title}</h4>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

// The deck's last slide: four numbered insight cards.
function InsightCards({ items, footnote }) {
  return (
    <section className="card fc-card fc-slide">
      <header className="fc-card-head">
        <h3 className="fc-title">Key insights and actions</h3>
        <p className="fc-note">What the period's payroll shows, and what to follow up.</p>
      </header>
      <div className="fc-card-body">
        <div className="fc-insights">
          {items.map(([title, text], i) => (
            <div key={title} className="fc-insight">
              <span className="fc-insight-num">{i + 1}</span>
              <span>
                <span className="fc-insight-title">{title}</span>
                <span className="fc-insight-text">{text}</span>
              </span>
            </div>
          ))}
        </div>
        <p className="fc-insight-foot">{footnote}</p>
      </div>
    </section>
  );
}

const rupeeText = (amount) => `₹${Math.round(amount).toLocaleString("en-IN")}`;

// Totals over a stacked bar: an extra label on the top segment.
function totalLabel(rows, key) {
  return ({ x, y, width, index }) => (
    <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={11.5} fontWeight={700} fill={INK}>
      {lakhText(rows[index][key])}
    </text>
  );
}

// Headline figures for the period, above the charts.
function KpiRow({ total, rows }) {
  const gross = lineOf(total, "Gross Salary").total;
  const net = lineOf(total, "Net Pay").total;
  const deductions = lineOf(total, "Total Deductions").total;
  const first = rows[0];
  const last = rows.at(-1);
  const change = last.headCount - first.headCount;
  const tiles = [
    { tone: "navy", label: "Gross salary", value: lakhText(lakh(gross)), sub: `${rows.length} month${rows.length === 1 ? "" : "s"} posted` },
    { tone: "good", label: "Net pay", value: lakhText(lakh(net)), sub: `${pctText(gross ? net / gross : 0)} of gross` },
    { tone: "bad", label: "Total deductions", value: lakhText(lakh(deductions)), sub: `${pctText(gross ? deductions / gross : 0)} of gross` },
    { tone: "navy", label: "Average gross / month", value: lakhText(lakh(gross / rows.length)), sub: `${first.month} – ${last.month}` },
    {
      tone: "blue",
      label: `Head count · ${last.month}`,
      value: last.headCount,
      sub: `${last.wagesCount} wages · ${last.salaryCount} salary`,
      trend: rows.length > 1 ? `${change > 0 ? "+" : ""}${change} since ${first.month}` : null,
      trendUp: change >= 0
    }
  ];
  return (
    <div className="fc-kpis">
      {tiles.map((tile) => (
        <div key={tile.label} className="fc-kpi">
          <span className="fc-kpi-label">{tile.label}</span>
          <span className={`fc-kpi-value is-${tile.tone}`}>{tile.value}</span>
          <span className="fc-kpi-sub">
            {tile.sub}
            {tile.trend && <span className={`fc-kpi-trend${tile.trendUp ? " is-up" : " is-down"}`}>{tile.trend}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

// The donut's legend as a list beside it: name, amount and share.
function DonutLegend({ slices, totalGross }) {
  return (
    <ul className="fc-donut-legend">
      {slices.map((slice) => (
        <li key={slice.name}>
          <span className="fc-donut-swatch" style={{ background: slice.colour }} aria-hidden="true" />
          <span className="fc-donut-name">{slice.name}</span>
          <span className="fc-donut-amount">{lakhText(lakh(slice.value))}</span>
          <span className="fc-donut-share">{pctText(slice.value / totalGross)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function FinancialCharts({ blocks }) {
  const rows = monthRows(blocks);
  const deductionOrder = deductionsBySize(rows);
  // Wages vs Salary chart: both axes topped at round numbers, and head counts
  // scaled so a bar's height on the lakh axis reads true on the right axis.
  const staffScale = (() => {
    const lakhTop = niceMax(20)(Math.max(...rows.map((r) => Math.max(r.wagesGross, r.salaryGross))));
    const countTop = niceMax(40)(Math.max(...rows.map((r) => Math.max(r.wagesCount, r.salaryCount))));
    return { lakhTop, countTop, perHead: lakhTop / countTop };
  })();
  const staffRows = rows.map((r) => ({
    ...r,
    wagesCountScaled: r.wagesCount * staffScale.perHead,
    salaryCountScaled: r.salaryCount * staffScale.perHead
  }));
  if (!rows.length) return null;

  const total = blocks[0];
  const totalGross = lineOf(total, "Gross Salary").total;
  const donut = COMPONENTS.map(([label, name], i) => ({ name, value: lineOf(total, label).total, colour: PALETTE[i] })).filter(
    (slice) => slice.value > 0
  );
  const withOther = rows.some((row) => row.Other);
  const components = withOther ? COMPONENTS : COMPONENTS.slice(0, -1);
  const topComponent = components.at(-1)[1];

  // Side-panel figures (lakh rows are in ₹ lakh, rupees in rows[i].rupees).
  const lakhOf = (value) => lakhText(value); // rows hold lakhs already
  const first = rows[0];
  const last = rows.at(-1);
  const best = rows.reduce((a, b) => (b.gross > a.gross ? b : a));
  const low = rows.reduce((a, b) => (b.gross < a.gross ? b : a));
  const growth = first.gross ? last.gross / first.gross - 1 : 0;
  const totalNet = lineOf(total, "Net Pay").total;
  const totalDeductions = lineOf(total, "Total Deductions").total;
  const totalOf = (label) => lineOf(total, label).total;
  const perHead = (amountLakh, heads) => rupeeText((amountLakh * LAKH) / (heads || 1));
  const rankedDeductions = [...DEDUCTIONS]
    .map((label) => ({ label, value: totalOf(label) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map(({ label, value }) => ({
      name: label,
      detail: `${lakhText(lakh(value))} • ${pctText(totalDeductions ? value / totalDeductions : 0)} of deductions`
    }));
  const incentives = rows.map((r) => r["Incentives & OT"]);

  return (
    <div className="fc">
      <div className="fc-head">
        <h2 className="fs-title">Payroll insights</h2>
        <p className="fc-lead">Trends from the monthly blocks; the split uses the Total. Amounts in ₹ lakh (1 L = ₹1,00,000).</p>
      </div>
      <KpiRow total={total} rows={rows} />
      <div className="fc-slides">
        <ChartCard
          title="Monthly trend: gross salary, deductions and net pay"
          note="Total earnings, total deductions and net pay posted in BC365 each month, ₹ lakh."
          side={
            <>
              <StatCards
                items={[
                  { value: lakhOf(best.gross), label: `Highest: ${best.month}`, tone: "good" },
                  { value: lakhOf(low.gross), label: `Lowest: ${low.month}`, tone: "bad" }
                ]}
              />
              <Note>
                Gross moved from {lakhOf(first.gross)} in {first.month} to {lakhOf(last.gross)} in {last.month} (
                {growth >= 0 ? "+" : ""}
                {(growth * 100).toFixed(1)}%), head count {first.headCount} → {last.headCount}.
              </Note>
            </>
          }
        >
          <LineChart data={rows} margin={{ top: 22, right: 18, left: 0, bottom: 4 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="month" {...lineXAxis} />
            <YAxis {...lakhAxis} />
            <Tooltip {...tooltipProps} formatter={(v) => lakhText(v)} />
            <Legend {...legendProps} />
            {[
              ["gross", "Gross Salary", "top"],
              ["deductions", "Total Deductions", "top"],
              ["net", "Net Pay", "bottom"]
            ].map(([key, name, position], i) => (
              <Line isAnimationActive={false} key={key} dataKey={key} name={name} stroke={PALETTE[i]} strokeWidth={2} dot={{ r: 4 }}>
                <LabelList dataKey={key} position={position} offset={9} fontSize={11} fill={INK} formatter={lakhText} />
              </Line>
            ))}
          </LineChart>
        </ChartCard>

        <ChartCard
          title="Gross salary composition by month"
          note="Each month's gross split into its pay items, ₹ lakh."
          side={
            <Bullets
              title="Reading the bars"
              items={[
                `Average ${lakhText(lakh(totalGross / rows.length))} a month`,
                `Gross per head in ${last.month}: ${perHead(last.gross, last.headCount)}`,
                `Basic + HRA: ${pctText(totalGross ? (totalOf("Basic Pay") + totalOf("House Rent Allowance (HRA)")) / totalGross : 0)} of gross`,
                `Incentives & OT: ${lakhOf(Math.min(...incentives))} to ${lakhOf(Math.max(...incentives))} a month`
              ]}
            />
          }
        >
          <BarChart data={rows} margin={{ top: 24, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="month" {...axisProps} />
            <YAxis {...lakhAxis} />
            <Tooltip {...tooltipProps} formatter={(v) => lakhText(v)} cursor={{ fill: "rgba(23,26,24,0.04)" }} />
            <Legend {...legendProps} />
            {components.map(([, key], i) => (
              <Bar isAnimationActive={false} key={key} dataKey={key} stackId="gross" fill={PALETTE[i]} stroke="#fff" strokeWidth={1}>
                {key === topComponent && <LabelList content={totalLabel(rows, "gross")} />}
              </Bar>
            ))}
          </BarChart>
        </ChartCard>

        <ChartCard
          title="Wages vs Salary staff"
          note="Each month: Wages gross and head count, then Salary gross and head count. Gross in ₹ lakh (left), head count in employees (right)."
          side={
            <>
              <StatCards
                items={[
                  { value: String(last.wagesCount), label: `Wages staff · ${last.month}`, tone: "teal" },
                  { value: String(last.salaryCount), label: `Salary staff · ${last.month}`, tone: "brass" }
                ]}
              />
              <Note>
                Average gross per head in {last.month}: wages {perHead(last.wagesGross, last.wagesCount)}, salary{" "}
                {perHead(last.salaryGross, last.salaryCount)}.
              </Note>
            </>
          }
        >
          <ComposedChart data={staffRows} margin={{ top: 22, right: 8, left: 6, bottom: 4 }} barGap={3} barCategoryGap="14%">
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="month" {...axisProps} />
            <YAxis
              yAxisId="lakh"
              {...lakhAxis}
              width={58}
              domain={[0, staffScale.lakhTop]}
              tickCount={5}
              label={{ value: "Gross (₹ lakh)", angle: -90, position: "insideLeft", offset: 10, fill: MUTED, fontSize: 11.5 }}
            />
            <YAxis
              yAxisId="count"
              orientation="right"
              {...axisProps}
              width={52}
              domain={[0, staffScale.countTop]}
              tickCount={5}
              allowDecimals={false}
              label={{ value: "Head count", angle: 90, position: "insideRight", offset: 10, fill: MUTED, fontSize: 11.5 }}
            />
            <Tooltip
              {...tooltipProps}
              formatter={(v, name, item) =>
                name === "Wages head count"
                  ? item.payload.wagesCount
                  : name === "Salary head count"
                    ? item.payload.salaryCount
                    : lakhText(v)
              }
              cursor={{ fill: "rgba(23,26,24,0.04)" }}
            />
            <Legend
              {...legendProps}
              payload={[
                ["Wages gross", PALETTE[0]],
                ["Wages head count", HEAD_COUNT_TINT[0]],
                ["Salary gross", PALETTE[1]],
                ["Salary head count", HEAD_COUNT_TINT[1]]
              ].map(([value, color]) => ({ value, color, type: "circle" }))}
            />
            {/* All four bars on the lakh axis, so they sit in this order; head
                counts are scaled onto it, and the right axis reads them back. */}
            {[
              ["wagesGross", "Wages gross", PALETTE[0], (v) => v.toFixed(2)],
              ["wagesCountScaled", "Wages head count", HEAD_COUNT_TINT[0], (v) => Math.round(v / staffScale.perHead)],
              ["salaryGross", "Salary gross", PALETTE[1], (v) => v.toFixed(2)],
              ["salaryCountScaled", "Salary head count", HEAD_COUNT_TINT[1], (v) => Math.round(v / staffScale.perHead)]
            ].map(([key, name, colour, format]) => (
              <Bar isAnimationActive={false} key={key} yAxisId="lakh" dataKey={key} name={name} fill={colour} radius={[4, 4, 0, 0]} maxBarSize={44}>
                <LabelList dataKey={key} position="top" offset={6} fontSize={10.5} fontWeight={600} fill={INK} formatter={format} />
              </Bar>
            ))}
            {/* Carries the right axis; draws nothing. */}
            <Line yAxisId="count" dataKey="wagesCount" stroke="none" dot={false} activeDot={false} legendType="none" tooltipType="none" isAnimationActive={false} />
          </ComposedChart>
        </ChartCard>

        <section className="card fc-card fc-slide">
          <header className="fc-card-head">
            <h3 className="fc-title">Gross salary split (Total)</h3>
            <p className="fc-note">Share of each pay item in the period's gross salary.</p>
          </header>
          <div className="fc-card-body fc-donut">
            <div className="fc-donut-plot">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip {...tooltipProps} formatter={(v, name) => [`${lakhText(lakh(v))} · ${pctText(v / totalGross)}`, name]} />
                  <Pie
                    isAnimationActive={false}
                    data={donut}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="62%"
                    outerRadius="92%"
                    startAngle={90}
                    endAngle={-270}
                    stroke="#fff"
                    strokeWidth={2}
                    label={sliceLabel(totalGross)}
                    labelLine={false}
                  >
                    {donut.map((slice) => (
                      <Cell key={slice.name} fill={slice.colour} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="fc-donut-centre" aria-hidden="true">
                <span className="fc-donut-centre-value">{lakhText(lakh(totalGross))}</span>
                <span className="fc-donut-centre-label">gross salary</span>
              </div>
            </div>
            <DonutLegend slices={donut} totalGross={totalGross} />
          </div>
        </section>

        <ChartCard
          title="Deductions: where the money goes"
          note="ESIC and PTAX are only a few thousand rupees, so their slices are drawn bigger than scale to show; hover a bar for the real amounts."
          side={
            <>
              <Ranked title="Largest deductions" items={rankedDeductions} />
              <Note>
                <span className="fc-callout-rows">
                  {[
                    ["Compliance Deductions", totalOf("Compliance Deductions")],
                    ["Advance Recover", totalOf("Advance Recover")],
                    ["Total Deductions", totalDeductions]
                  ].map(([label, value]) => (
                    <span key={label} className={`fc-callout-row${label === "Total Deductions" ? " is-total" : ""}`}>
                      <span>{label}</span>
                      <span>
                        {pctText(totalGross ? value / totalGross : 0)}
                        <small className="fc-callout-sub"> ({lakhText(lakh(value))})</small>
                      </span>
                    </span>
                  ))}
                </span>
              </Note>
            </>
          }
        >
          <BarChart data={rows} margin={{ top: 24, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="month" {...axisProps} />
            <YAxis {...lakhAxis} tickFormatter={(v) => v.toFixed(1)} />
            <Tooltip
              {...tooltipProps}
              formatter={(v, name, item) => rupeeText(item.payload.rupees[name] ?? v * LAKH)}
              itemSorter={(item) => -deductionOrder.indexOf(item.name)}
              cursor={{ fill: "rgba(23,26,24,0.04)" }}
            />
            <Legend {...legendProps} />
            {deductionOrder.map((key, i) => (
              <Bar isAnimationActive={false} key={key} dataKey={shownKey(key)} name={key} stackId="ded" fill={deductionColour(key)} stroke="#fff" strokeWidth={1}>
                {i === deductionOrder.length - 1 && <LabelList content={totalLabel(rows, "deductions")} />}
              </Bar>
            ))}
          </BarChart>
        </ChartCard>

        <InsightCards
          items={[
            ["Gross trend", `${lakhOf(first.gross)} in ${first.month} → ${lakhOf(last.gross)} in ${last.month}; head count ${first.headCount} → ${last.headCount}.`],
            ["Incentives & OT", `Swings from ${lakhOf(Math.min(...incentives))} to ${lakhOf(Math.max(...incentives))} a month: review approvals for the high months.`],
            ["Deductions", `${pctText(totalGross ? totalDeductions / totalGross : 0)} of gross. TDS ${lakhText(lakh(totalOf("TDS on Salary")))} and PF ${lakhText(lakh(totalOf("PF")))} are the largest statutory items.`],
            ["Advance recovery", `${lakhText(lakh(totalOf("Advance Recover")))} recovered on G/L 1602. Track open loans against monthly recoveries.`]
          ]}
          footnote={`Net pay for the period: ${lakhText(lakh(totalNet))} (${pctText(totalGross ? totalNet / totalGross : 0)} of gross) across ${rows.length} posted month${rows.length === 1 ? "" : "s"}.`}
        />
      </div>
    </div>
  );
}
