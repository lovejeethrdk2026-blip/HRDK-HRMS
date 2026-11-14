import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { getAttendance } from "../../api/me";
import { Card, ErrorText, Row, Screen, monthName, showDate } from "../../ui/components";
import { useLoad } from "../../ui/useLoad";
import { useTheme } from "../../ui/theme";

const pad = (n) => String(n).padStart(2, "0");
const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
const shiftMonth = (ym, by) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

// status -> [label, tone]
const STATUS = { P: ["Present", "good"], A: ["Absent", "bad"], L: ["Leave", "info"], H: ["Half day", "warn"], WO: ["Week off", "muted"] };

// Attendance: a month calendar coloured by status; tap a day for its punches.
export default function Attendance() {
  const c = useTheme();
  const [month, setMonth] = useState(thisMonth);
  const [picked, setPicked] = useState(null);
  const { data, error, loading, reload } = useLoad(() => getAttendance(month), [month]);

  const tones = {
    good: [c.goodSoft, c.good],
    bad: [c.badSoft, c.bad],
    info: [c.infoSoft, c.info],
    warn: [c.warnSoft, c.warn],
    muted: [c.border, c.muted]
  };

  const byDate = new Map((data?.days || []).map((d) => [d.date, d]));
  const [y, m] = month.split("-").map(Number);
  const firstWeekday = (new Date(y, m - 1, 1).getDay() + 6) % 7; // Monday first
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const counts = {};
  for (const d of data?.days || []) counts[d.status] = (counts[d.status] || 0) + (d.status === "H" ? 1 : 1);
  const lateDays = (data?.days || []).filter((d) => d.late).length;
  const day = picked ? byDate.get(picked) : null;

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <View style={styles.monthBar}>
        <Pressable onPress={() => { setMonth(shiftMonth(month, -1)); setPicked(null); }} hitSlop={12}>
          <Text style={[styles.arrow, { color: c.brand }]}>‹</Text>
        </Pressable>
        <Text style={[styles.month, { color: c.text }]}>{monthName(month)}</Text>
        <Pressable
          onPress={() => { setMonth(shiftMonth(month, 1)); setPicked(null); }}
          disabled={month >= thisMonth()}
          hitSlop={12}
        >
          <Text style={[styles.arrow, { color: month >= thisMonth() ? c.border : c.brand }]}>›</Text>
        </Pressable>
      </View>

      <ErrorText error={error} />

      <Card>
        <View style={styles.week}>
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <Text key={i} style={[styles.weekday, { color: c.muted }]}>{d}</Text>
          ))}
        </View>
        <View style={styles.grid}>
          {cells.map((n, i) => {
            if (!n) return <View key={`e${i}`} style={styles.cell} />;
            const date = `${month}-${pad(n)}`;
            const info = byDate.get(date);
            const [bg, fg] = info ? tones[STATUS[info.status]?.[1] || "muted"] : ["transparent", c.muted];
            const selected = picked === date;
            return (
              <Pressable key={date} style={styles.cell} onPress={() => setPicked(date)}>
                <View style={[styles.dayDot, { backgroundColor: bg, borderColor: selected ? c.brand : "transparent" }]}>
                  <Text style={{ color: fg, fontWeight: "600" }}>{n}</Text>
                  {info?.late ? <View style={[styles.lateMark, { backgroundColor: c.warn }]} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.legend}>
          {Object.entries(STATUS).map(([key, [label, tone]]) => (
            <View key={key} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: tones[tone][1] }]} />
              <Text style={{ color: c.muted, fontSize: 12 }}>{label}</Text>
            </View>
          ))}
        </View>
      </Card>

      {day && (
        <Card title={showDate(picked)}>
          <Row label="Status" value={STATUS[day.status]?.[0] || day.status} strong />
          {day.in ? <Row label="In" value={day.in} /> : null}
          {day.out ? <Row label="Out" value={day.out} /> : null}
          {day.worked ? <Row label="Worked" value={day.worked} /> : null}
          {day.late ? <Row label="Late by" value={day.late} /> : null}
          {day.earlyOut ? <Row label="Left early by" value={day.earlyOut} /> : null}
          {day.leave ? <Row label="Leave" value={`${day.leave.type}${day.leave.half ? " (half day)" : ""}`} /> : null}
        </Card>
      )}

      <Card title="This month">
        <Row label="Present" value={counts.P || 0} />
        <Row label="Half days" value={counts.H || 0} />
        <Row label="Leave" value={counts.L || 0} />
        <Row label="Absent" value={counts.A || 0} />
        <Row label="Late days" value={lateDays} />
        {data?.shift && <Row label="Shift" value={`${data.shift.in} – ${data.shift.out}`} />}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  monthBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8 },
  arrow: { fontSize: 32, fontWeight: "300", paddingHorizontal: 8 },
  month: { fontSize: 18, fontWeight: "700" },
  week: { flexDirection: "row" },
  weekday: { width: `${100 / 7}%`, textAlign: "center", fontSize: 12, fontWeight: "600" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 3 },
  dayDot: { flex: 1, borderRadius: 10, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  lateMark: { position: "absolute", top: 4, right: 4, width: 6, height: 6, borderRadius: 3 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 }
});
