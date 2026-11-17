import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getAttendance } from "../../api/me";
import DayStrip from "../../ui/DayStrip";
import Ring from "../../ui/Ring";
import { Card, dayName, ErrorText, LoadingCards, monthName, monthShort, Pill, Screen, Section, tap } from "../../ui/components";
import { useLoad } from "../../ui/useLoad";
import { radius, space, TOUCH, type, useTheme } from "../../ui/theme";

const pad = (n) => String(n).padStart(2, "0");
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const thisMonth = () => isoOf(new Date()).slice(0, 7);
const shiftMonth = (ym, by) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
const minutesOf = (text) => {
  const m = /^(\d+):(\d{2})/.exec(String(text || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
};
const hm = (min) => `${Math.floor(min / 60)}:${pad(Math.round(min % 60))}`;

// status -> [name, colour]
const STATUS = {
  P: ["Present", "good"],
  H: ["Half day", "warn"],
  L: ["Leave", "info"],
  A: ["Absent", "bad"],
  WO: ["Week off", "muted"]
};

// Attendance: how the month went (ring + key figures), the month calendar
// coloured by day, and the picked day as a timeline with its details.
export default function Attendance() {
  const c = useTheme();
  const [month, setMonth] = useState(thisMonth);
  const [picked, setPicked] = useState(null);
  const { data, error, loading, reload } = useLoad(() => getAttendance(month), [month]);

  const todayIso = isoOf(new Date());
  const days = data?.days || [];
  const byDate = new Map(days.map((d) => [d.date, d]));
  const count = (s) => days.filter((d) => d.status === s).length;
  const workingDays = days.filter((d) => d.status !== "WO" && d.status !== "-").length;
  const present = count("P") + count("H") * 0.5;
  const workedMin = days.reduce((sum, d) => sum + minutesOf(d.worked), 0);
  const workedDays = days.filter((d) => minutesOf(d.worked) > 0).length;
  const late = days.filter((d) => d.late).length;
  const missed = days.filter((d) => d.missed).length;

  const [y, m] = month.split("-").map(Number);
  const firstWeekday = (new Date(y, m - 1, 1).getDay() + 6) % 7; // Monday first
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const selected = picked || (month === thisMonth() ? todayIso : null);
  const day = selected ? byDate.get(selected) : null;

  const toneOf = (status) => {
    const t = STATUS[status]?.[1];
    if (!t) return null;
    return t === "muted" ? [c.sunk, c.faint] : [c[`${t}Soft`], c[t]];
  };

  function go(by) {
    tap();
    setMonth(shiftMonth(month, by));
    setPicked(null);
  }

  const switcher = (
    <View style={[styles.switcher, { backgroundColor: c.card, borderColor: c.border }]}>
      <Pressable onPress={() => go(-1)} hitSlop={8} accessibilityLabel="Previous month" style={styles.arrow}>
        <Ionicons name="chevron-back" size={18} color={c.brand} />
      </Pressable>
      <Text style={[type.label, { color: c.text, fontWeight: "700" }]}>
        {monthShort(month)} {y}
      </Text>
      <Pressable onPress={() => go(1)} disabled={month >= thisMonth()} hitSlop={8} accessibilityLabel="Next month" style={styles.arrow}>
        <Ionicons name="chevron-forward" size={18} color={month >= thisMonth() ? c.border : c.brand} />
      </Pressable>
    </View>
  );

  return (
    <Screen safeTop title="Attendance" right={switcher} refreshing={loading} onRefresh={reload}>
      <ErrorText error={error} />

      {!data && loading ? (
        <LoadingCards count={2} />
      ) : (
        <>
          <Card tone="brand">
            <View style={styles.hero}>
              <Ring
                share={workingDays ? present / workingDays : 0}
                value={`${present % 1 ? present.toFixed(1) : present}`}
                unit={`of ${workingDays} days`}
                track={c.card}
              />
              <View style={{ flex: 1, gap: space.sm }}>
                <Text style={[type.heading, { color: c.brandInk }]}>{monthName(month)}</Text>
                <HeroStat label="Time inside" value={hm(workedMin)} c={c} />
                <HeroStat label="Average a day" value={workedDays ? hm(workedMin / workedDays) : "–"} c={c} />
                <View style={styles.flags}>
                  {late ? <Pill text={`${late} late`} tone="warn" icon="time-outline" /> : null}
                  {missed ? <Pill text={`${missed} missed punch`} tone="bad" icon="alert-circle-outline" /> : null}
                  {count("A") ? <Pill text={`${count("A")} absent`} tone="bad" /> : null}
                  {!late && !missed && !count("A") ? <Pill text="All good" tone="good" icon="checkmark-circle-outline" /> : null}
                </View>
              </View>
            </View>
          </Card>

          <Card>
            <View style={styles.week}>
              {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                <Text key={i} style={[type.small, styles.weekday, { color: c.faint }]}>
                  {d}
                </Text>
              ))}
            </View>
            <View style={styles.grid}>
              {cells.map((n, i) => {
                if (!n) return <View key={`e${i}`} style={styles.cell} />;
                const date = `${month}-${pad(n)}`;
                const info = byDate.get(date);
                const tone = info ? toneOf(info.status) : null;
                const on = selected === date;
                const future = date > todayIso;
                return (
                  <Pressable
                    key={date}
                    style={styles.cell}
                    onPress={() => {
                      tap();
                      setPicked(date);
                    }}
                    disabled={future}
                    accessibilityLabel={`${n}, ${STATUS[info?.status]?.[0] || (future ? "upcoming" : "no record")}`}
                  >
                    <View
                      style={[
                        styles.day,
                        { backgroundColor: on ? c.brand : tone ? tone[0] : "transparent" },
                        date === todayIso && !on && { borderWidth: 2, borderColor: c.brand }
                      ]}
                    >
                      <Text style={[type.label, type.figure, { color: on ? "#FFFFFF" : tone ? tone[1] : future ? c.border : c.faint, fontWeight: "700" }]}>
                        {n}
                      </Text>
                    </View>
                    {info?.missed || info?.late ? <View style={[styles.mark, { backgroundColor: info.missed ? c.bad : c.warn }]} /> : null}
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.legend}>
              {Object.entries(STATUS).map(([key, [name, t]]) => (
                <View key={key} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: t === "muted" ? c.faint : c[t] }]} />
                  <Text style={[type.small, { color: c.muted }]}>{name}</Text>
                </View>
              ))}
            </View>
          </Card>

          {selected && (
            <Section
              title={dayName(selected)}
              right={day?.status && STATUS[day.status] ? <Pill text={STATUS[day.status][0]} tone={STATUS[day.status][1]} /> : null}
            >
              <Card>
                {day?.pairs?.length ? (
                  <>
                    <DayStrip
                      pairs={day.pairs}
                      shift={data?.shift}
                      nowMin={selected === todayIso ? new Date().getHours() * 60 + new Date().getMinutes() : undefined}
                    />
                    <View style={styles.facts}>
                      <Fact label="First entry" value={day.in || "–"} />
                      <Fact label="Left at" value={day.out || (selected === todayIso ? "Inside" : "–")} />
                      <Fact label="Worked" value={day.worked ? day.worked.replace(" (in)", "") : "–"} strong />
                      <Fact
                        label="Out of office"
                        value={day.outside && day.outside !== "0:00" ? day.outside : "–"}
                        warn={Boolean(day.outside && day.outside !== "0:00")}
                      />
                    </View>
                    {day.late ? <Note icon="time-outline" tone="warn" text={`Late by ${day.late}`} /> : null}
                    {day.earlyOut ? <Note icon="exit-outline" tone="warn" text={`Left ${day.earlyOut} early`} /> : null}
                    {day.missed ? <Note icon="alert-circle-outline" tone="bad" text={`Missed punch: ${day.missed}. Punch ENTRY and EXIT every time.`} /> : null}
                    {day.leave ? <Note icon="airplane-outline" tone="info" text={`Leave: ${day.leave.type}${day.leave.half ? ", half day" : ""}`} /> : null}
                    {day.source === "guess" ? (
                      <Text style={[type.small, { color: c.faint }]}>No ENTRY / EXIT machine record this day, so in and out are estimated.</Text>
                    ) : null}
                  </>
                ) : day?.worked ? (
                  // Punch times switched off by HR: status and worked hours only.
                  <>
                    <View style={styles.facts}>
                      <Fact label="Worked" value={day.worked.replace(" (in)", "")} strong />
                    </View>
                    {day.leave ? <Note icon="airplane-outline" tone="info" text={`Leave: ${day.leave.type}${day.leave.half ? ", half day" : ""}`} /> : null}
                  </>
                ) : (
                  <Text style={[type.body, { color: c.muted }]}>
                    {day?.status === "WO"
                      ? "Sunday, week off."
                      : day?.status === "L"
                        ? `On leave (${day.leave?.type}).`
                        : day
                          ? "No punches this day."
                          : "No record for this day."}
                  </Text>
                )}
              </Card>
            </Section>
          )}

          {data?.shift ? (
            <Text style={[type.small, { color: c.faint, textAlign: "center" }]}>
              Your shift {data.shift.in} to {data.shift.out}. Lunch 13:00 to 15:00 is not counted as out of office.
            </Text>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function HeroStat({ label, value, c }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={[type.label, { color: c.brandInk, opacity: 0.8 }]}>{label}</Text>
      <Text style={[type.label, type.figure, { color: c.brandInk, fontWeight: "700" }]}>{value}</Text>
    </View>
  );
}

function Fact({ label, value, strong, warn }) {
  const c = useTheme();
  return (
    <View style={[styles.fact, { backgroundColor: c.sunk }]}>
      <Text style={[type.small, { color: c.muted }]}>{label}</Text>
      <Text style={[strong ? type.title : type.heading, type.figure, { color: strong ? c.brand : warn ? c.warn : c.text }]}>{value}</Text>
    </View>
  );
}

function Note({ icon, tone, text }) {
  const c = useTheme();
  return (
    <View style={[styles.note, { backgroundColor: c[`${tone}Soft`] }]}>
      <Ionicons name={icon} size={16} color={c[tone]} />
      <Text style={[type.label, { color: c[tone], flex: 1 }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  switcher: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 2 },
  arrow: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  hero: { flexDirection: "row", alignItems: "center", gap: space.lg },
  flags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  week: { flexDirection: "row" },
  weekday: { width: `${100 / 7}%`, textAlign: "center", fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: 2 },
  cell: { width: `${100 / 7}%`, height: TOUCH + 2, alignItems: "center", justifyContent: "center" },
  day: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  mark: { position: "absolute", bottom: 1, width: 5, height: 5, borderRadius: 3 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: space.md, justifyContent: "center" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  fact: { flexBasis: "47%", flexGrow: 1, borderRadius: radius.inner, padding: space.md, gap: 2 },
  note: { flexDirection: "row", alignItems: "center", gap: space.sm, borderRadius: radius.inner, paddingHorizontal: space.md, paddingVertical: space.sm }
});
