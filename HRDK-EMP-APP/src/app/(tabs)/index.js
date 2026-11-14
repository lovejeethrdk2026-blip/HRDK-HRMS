import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { getAttendance, getLeave, getPayslips } from "../../api/me";
import { useAuth } from "../../auth/AuthContext";
import { Button, Card, ErrorText, Row, Screen, monthName, rupees } from "../../ui/components";
import { useLoad } from "../../ui/useLoad";
import { useTheme } from "../../ui/theme";

const pad = (n) => String(n).padStart(2, "0");
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Home: today's punches, leave left and the latest payslip at a glance.
export default function Home() {
  const c = useTheme();
  const { employee } = useAuth();
  const today = todayIso();
  const { data, error, loading, reload } = useLoad(async () => {
    const [attendance, leave, payslips] = await Promise.all([getAttendance(today.slice(0, 7)), getLeave(), getPayslips()]);
    return { attendance, leave, payslips };
  }, [today]);

  const day = data?.attendance.days.find((d) => d.date === today);
  const latest = data?.payslips.find((p) => p.released);
  const shift = data?.attendance.shift;

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <View>
        <Text style={[styles.hello, { color: c.muted }]}>Hello,</Text>
        <Text style={[styles.name, { color: c.text }]}>{employee?.name}</Text>
        <Text style={{ color: c.muted }}>
          {employee?.employeeId} · {employee?.department}
        </Text>
      </View>

      <ErrorText error={error} />

      <Card title="Today">
        {shift && <Row label="Shift" value={`${shift.in} – ${shift.out}`} />}
        <Row label="In" value={day?.in || "–"} strong />
        <Row label="Out" value={day?.out || "–"} strong />
        {day?.late ? <Row label="Late by" value={day.late} /> : null}
        {day?.leave ? <Row label="On leave" value={`${day.leave.type}${day.leave.half ? " (half day)" : ""}`} /> : null}
      </Card>

      <Card title="Leave left" right={<Text style={{ color: c.muted }}>FY {data?.leave.fy}-{String((data?.leave.fy || 0) + 1).slice(2)}</Text>}>
        <View style={styles.leaveRow}>
          {(data?.leave.types || [])
            .filter((t) => t.yearlyDays)
            .map((t) => (
              <View key={t.code} style={[styles.leaveBox, { backgroundColor: c.brandSoft }]}>
                <Text style={[styles.leaveNum, { color: c.brand }]}>{data.leave.balances[t.code]?.left ?? "–"}</Text>
                <Text style={{ color: c.brand, fontWeight: "600" }}>{t.code}</Text>
              </View>
            ))}
        </View>
        <Button title="Apply leave" kind="secondary" onPress={() => router.push("/apply-leave")} />
      </Card>

      <Card title="Latest payslip">
        {latest ? (
          <>
            <Row label={monthName(latest.month)} value={rupees(latest.net)} strong />
            <Button title="View payslip" kind="secondary" onPress={() => router.push(`/payslip/${latest.month}`)} />
          </>
        ) : (
          <Text style={{ color: c.muted }}>No payslip released yet.</Text>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hello: { fontSize: 15 },
  name: { fontSize: 24, fontWeight: "700" },
  leaveRow: { flexDirection: "row", gap: 10 },
  leaveBox: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  leaveNum: { fontSize: 24, fontWeight: "700" }
});
