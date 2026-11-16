import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getAttendance, getChatUnread, getLeave, getPayslips, getProfileDetails } from "../../api/me";
import { useAuth } from "../../auth/AuthContext";
import DayStrip from "../../ui/DayStrip";
import Ring from "../../ui/Ring";
import { Card, ErrorText, IconCircle, ListRow, LoadingCards, monthName, Pill, Progress, rupees, Screen, Section, tap } from "../../ui/components";
import { useLoad } from "../../ui/useLoad";
import { elevation, radius, space, TOUCH, type, useTheme } from "../../ui/theme";

const LOGO = require("../../assets/logo.png");
const pad = (n) => String(n).padStart(2, "0");
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const minutesOf = (text) => {
  const m = /^(\d+):(\d{2})/.exec(String(text || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
};
const toMin = (hhmm) => (hhmm ? Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) : null);
const hm = (min) => `${Math.floor(min / 60)}:${pad(Math.round(min % 60))}`;

// A full day in minutes: the shift less 1 hour lunch for a day shift over
// 13:00-15:00 (as the HRMS counts it), else 8 hours.
function fullDayMinutes(shift) {
  const a = toMin(shift?.in);
  const b = toMin(shift?.out);
  if (a === null || b === null || a === b) return 8 * 60;
  const length = (b - a + 1440) % 1440;
  return length - (b > a && a <= 13 * 60 && b >= 15 * 60 ? 60 : 0);
}

const greeting = (hour) => (hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening");
const firstName = (name) => {
  const w = String(name || "").trim().split(/\s+/)[0] || "";
  return w.charAt(0) + w.slice(1).toLowerCase();
};

const STATUS = {
  P: ["Present", "good"],
  H: ["Half day", "warn"],
  L: ["On leave", "info"],
  WO: ["Week off", "muted"],
  A: ["Absent", "bad"]
};

// Monday..Sunday of the week holding `date`.
function weekOf(date) {
  const monday = new Date(date);
  monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

// Home: today's work as the headline (ring + timeline), leave and salary at a
// glance, this week's days, and a nudge when the profile has gaps.
export default function Home() {
  const c = useTheme();
  const { employee } = useAuth();
  const now = new Date();
  const todayIso = isoOf(now);
  const week = weekOf(now);
  const months = [...new Set(week.map((d) => isoOf(d).slice(0, 7)))].filter((m) => m <= todayIso.slice(0, 7));

  const { data, error, loading, reload } = useLoad(async () => {
    const [att, leave, payslips, profile, chat] = await Promise.all([
      Promise.all(months.map((m) => getAttendance(m))),
      getLeave(),
      getPayslips().catch(() => []),
      getProfileDetails().catch(() => null),
      getChatUnread().catch(() => ({ unread: 0 }))
    ]);
    return { days: att.flatMap((a) => a.days), shift: att[att.length - 1]?.shift || null, leave, payslips, profile, unread: chat.unread };
  }, [todayIso]);

  const byDate = new Map((data?.days || []).map((d) => [d.date, d]));
  const day = byDate.get(todayIso);
  const full = fullDayMinutes(data?.shift);
  const worked = minutesOf(day?.worked);
  const last = day?.pairs?.[day.pairs.length - 1];
  const inside = Boolean(last?.in && !last?.out);
  const latest = data?.payslips.find((p) => p.released);
  const leaveTypes = (data?.leave.types || []).filter((t) => t.yearlyDays > 0);
  const leaveLeft = leaveTypes.reduce((sum, t) => sum + (data.leave.balances[t.code]?.left || 0), 0);
  const missing = data?.profile ? data.profile.missingFields.length + data.profile.missingDocuments.length : 0;
  const required = data?.profile?.required || 0;
  const [statusText, statusTone] = inside ? ["Inside now", "good"] : STATUS[day?.status] || ["No punch yet", "muted"];
  const left = Math.max(0, full - worked);

  return (
    <Screen safeTop refreshing={loading} onRefresh={reload}>
      <View style={styles.header}>
        <View style={[styles.logo, elevation(c)]}>
          <Image source={LOGO} style={styles.logoImg} resizeMode="contain" accessibilityLabel="HRDK" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[type.label, { color: c.muted }]}>{greeting(now.getHours())},</Text>
          <Text style={[type.title, { color: c.text }]} numberOfLines={1}>
            {firstName(employee?.name)}
          </Text>
        </View>
        <RoundIcon icon="chatbubble-ellipses-outline" label="Chat with my manager and HR" dot={data?.unread > 0} onPress={() => router.push("/chat")} />
        <RoundIcon icon="person-outline" label="My profile" dot={missing > 0} onPress={() => router.push("/profile")} />
      </View>

      <ErrorText error={error} />

      {!data && loading ? (
        <LoadingCards count={3} />
      ) : (
        <>
          <Card tone="brand" onPress={() => router.push("/attendance")}>
            <View style={styles.heroTop}>
              <View style={{ flex: 1, gap: space.xs }}>
                <Pill text={statusText} tone={statusTone} icon={inside ? "radio-button-on" : undefined} />
                <Text style={[type.label, { color: c.brandInk, opacity: 0.8, marginTop: space.xs }]}>Worked today</Text>
                <Text style={[type.hero, type.figure, { color: c.brandInk }]}>{hm(worked)}</Text>
                <Text style={[type.small, { color: c.brandInk, opacity: 0.85 }]}>
                  {day?.in ? `In at ${day.in}` : "Punch ENTRY when you arrive"}
                  {inside && left ? `. ${hm(left)} to a full day` : day?.out ? `, left ${day.out}` : ""}
                </Text>
              </View>
              <Ring share={worked / full} value={`${Math.min(100, Math.round((worked / full) * 100))}%`} unit={`of ${Math.round(full / 60)}h`} track={c.card} />
            </View>
            <DayStrip pairs={day?.pairs || []} shift={data?.shift} nowMin={now.getHours() * 60 + now.getMinutes()} />
            {day?.missed ? (
              <View style={[styles.alert, { backgroundColor: c.card }]}>
                <Ionicons name="alert-circle" size={16} color={c.bad} />
                <Text style={[type.small, { color: c.bad, flex: 1, fontWeight: "600" }]}>Missed punch today. Punch ENTRY and EXIT every time.</Text>
              </View>
            ) : null}
          </Card>

          <View style={styles.pair}>
            <StatCard
              icon="airplane"
              tone="brand"
              label="Leave left"
              value={leaveTypes.length ? String(leaveLeft) : "–"}
              unit={leaveTypes.map((t) => `${t.code} ${data.leave.balances[t.code]?.left ?? 0}`).join(", ")}
              onPress={() => router.push("/leave")}
            />
            <StatCard
              icon="wallet"
              tone="gold"
              label="Last salary"
              value={latest ? rupees(latest.net) : "–"}
              unit={latest ? monthName(latest.month) : "Not paid yet"}
              onPress={() => router.push(latest ? `/payslip/${latest.month}` : "/payslip")}
            />
          </View>

          <Section title="This week" right={<Text style={[type.label, { color: c.muted }]}>{monthName(todayIso.slice(0, 7))}</Text>}>
            <Card>
              <View style={styles.week}>
                {week.map((d) => {
                  const iso = isoOf(d);
                  const info = byDate.get(iso);
                  const today = iso === todayIso;
                  const future = iso > todayIso;
                  const tone = STATUS[info?.status]?.[1];
                  return (
                    <Pressable
                      key={iso}
                      style={styles.weekDay}
                      disabled={future}
                      onPress={() => {
                        tap();
                        router.push("/attendance");
                      }}
                      accessibilityLabel={`${d.toLocaleDateString("en-IN", { weekday: "long" })}, ${STATUS[info?.status]?.[0] || (future ? "upcoming" : "no record")}`}
                    >
                      <Text style={[type.small, { color: today ? c.brand : c.faint, fontWeight: "700" }]}>{"MTWTFSS"[(d.getDay() + 6) % 7]}</Text>
                      <View style={[styles.dateBubble, { backgroundColor: today ? c.brand : c.sunk }]}>
                        <Text style={[type.label, type.figure, { color: today ? "#FFFFFF" : future ? c.faint : c.text, fontWeight: "700" }]}>{pad(d.getDate())}</Text>
                      </View>
                      <View style={[styles.dot, { backgroundColor: tone && tone !== "muted" ? c[tone] : "transparent" }]} />
                    </Pressable>
                  );
                })}
              </View>
            </Card>
          </Section>

          {missing > 0 && (
            <Card onPress={() => router.push("/profile")}>
              <View style={styles.nudge}>
                <IconCircle name="person" tone="bad" size={40} />
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={[type.heading, { color: c.text }]}>Complete your profile</Text>
                  <Progress share={required ? (required - missing) / required : 0} tone="bad" />
                  <Text style={[type.small, { color: c.muted }]}>
                    {missing} thing{missing > 1 ? "s" : ""} missing, like {data.profile.missingDocuments[0] || data.profile.missingFields[0]?.split(": ")[1]}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={c.faint} />
              </View>
            </Card>
          )}

          <Card padded={false}>
            <ListRow icon="add-circle-outline" label="Apply leave" note="Sent to your manager for approval" onPress={() => router.push("/apply-leave")} />
            <ListRow
              icon="chatbubble-ellipses-outline"
              label="Chat with my manager and HR"
              note={data?.unread ? `${data.unread} new message${data.unread > 1 ? "s" : ""}` : "Ask anything about work or pay"}
              right={data?.unread ? <Pill text={String(data.unread)} tone="bad" /> : null}
              onPress={() => router.push("/chat")}
              last
            />
          </Card>
        </>
      )}
    </Screen>
  );
}

function RoundIcon({ icon, label, onPress, dot }) {
  const c = useTheme();
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.roundIcon, { backgroundColor: c.card, transform: [{ scale: pressed ? 0.94 : 1 }] }, elevation(c)]}
    >
      <Ionicons name={icon} size={20} color={c.text} />
      {dot ? <View style={[styles.badgeDot, { backgroundColor: c.bad, borderColor: c.card }]} /> : null}
    </Pressable>
  );
}

function StatCard({ icon, tone, label, value, unit, onPress }) {
  const c = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Card onPress={onPress} style={{ gap: space.sm }}>
        <IconCircle name={icon} tone={tone} size={36} />
        <Text style={[type.label, { color: c.muted }]}>{label}</Text>
        <Text style={[type.title, type.figure, { color: tone === "gold" ? c.gold : c.text }]} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        <Text style={[type.small, { color: c.faint }]} numberOfLines={1}>
          {unit}
        </Text>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: space.md },
  logo: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  logoImg: { width: 34, height: 34 },
  roundIcon: { width: TOUCH, height: TOUCH, borderRadius: TOUCH / 2, alignItems: "center", justifyContent: "center" },
  badgeDot: { position: "absolute", top: 9, right: 10, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: space.md },
  alert: { flexDirection: "row", alignItems: "center", gap: space.sm, borderRadius: radius.inner, padding: space.sm },
  pair: { flexDirection: "row", gap: space.md },
  week: { flexDirection: "row", justifyContent: "space-between" },
  weekDay: { alignItems: "center", gap: 6, flex: 1, minHeight: TOUCH },
  dateBubble: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  dot: { width: 6, height: 6, borderRadius: 3 },
  nudge: { flexDirection: "row", alignItems: "center", gap: space.md }
});
