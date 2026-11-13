import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// The Dashboard's attendance line. Kept in its own file so the chart library
// (~100 KB gzipped) is fetched after the Dashboard's numbers are on screen;
// pages/Dashboard.jsx loads it with React.lazy.

const TEAL = "#00918a"; // FinancialCharts.jsx PALETTE[0]
const MUTED = "#3f5c54"; // --text-muted
const GRID = "#e3efe5"; // --row-line
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// rows: [{ date, label: "DD/MM", present }]. yearView: one tick per month.
export default function AttendanceAreaChart({ rows, yearView, monthTicks }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="presentFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={TEAL} stopOpacity={0.25} />
            <stop offset="100%" stopColor={TEAL} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: MUTED, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: GRID }}
          interval={yearView ? 0 : "preserveStartEnd"}
          ticks={monthTicks}
          tickFormatter={yearView ? (label) => MONTHS[Number(label.slice(3)) - 1] : undefined}
          minTickGap={12}
        />
        <YAxis allowDecimals={false} tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip
          cursor={{ stroke: GRID }}
          labelFormatter={(_, items) => items?.[0]?.payload.date}
          formatter={(value) => [value, "Present"]}
        />
        <Area
          isAnimationActive={false}
          type="monotone"
          dataKey="present"
          name="Present"
          stroke={TEAL}
          strokeWidth={2}
          fill="url(#presentFill)"
          dot={rows.length <= 31 ? { r: 2.5, fill: TEAL, strokeWidth: 0 } : false}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
