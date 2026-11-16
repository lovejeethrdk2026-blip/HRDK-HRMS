import { StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { getPayslip } from "../../api/me";
import { Card, ErrorText, LoadingCards, monthName, rupees, Screen, Section } from "../../ui/components";
import { useLoad } from "../../ui/useLoad";
import { radius, space, type, useTheme } from "../../ui/theme";

// One month's payslip, read like a receipt: paid in hand on top, a bar showing
// how earnings split into pay and deductions, then each line.
export default function Payslip() {
  const c = useTheme();
  const { month } = useLocalSearchParams();
  const { data, error, loading } = useLoad(() => getPayslip(month), [month]);
  const kept = data && data.totalEarnings ? data.net / data.totalEarnings : 1;

  return (
    <Screen>
      <Stack.Screen options={{ title: monthName(month) }} />
      <ErrorText error={error} />
      {!data && loading ? (
        <LoadingCards count={2} />
      ) : data ? (
        <>
          <Card tone="gold">
            <Text style={[type.label, { color: c.gold, fontWeight: "700" }]}>Paid in hand</Text>
            <Text style={[type.hero, type.figure, { color: c.text }]}>{rupees(data.net)}</Text>
            <View style={[styles.split, { backgroundColor: c.card }]}>
              <View style={{ flex: kept, backgroundColor: c.gold }} />
              <View style={{ flex: Math.max(0, 1 - kept), backgroundColor: c.badSoft }} />
            </View>
            <View style={styles.legend}>
              <Legend color={c.gold} label="Earned" value={rupees(data.totalEarnings)} />
              <Legend color={c.bad} label="Deducted" value={rupees(data.totalDeductions)} />
            </View>
            {data.salaryTypes?.length ? <Text style={[type.small, { color: c.muted }]}>Paid as {data.salaryTypes.join(" and ").toLowerCase()}</Text> : null}
          </Card>

          <Section title="Earnings">
            <Card>
              {data.earnings.map((r) => (
                <Line key={r.label} label={r.label} amount={r.amount} />
              ))}
              <Total label="Total earned" amount={data.totalEarnings} />
            </Card>
          </Section>

          <Section title="Deductions">
            <Card>
              {data.deductions.length ? (
                data.deductions.map((r) => <Line key={r.label} label={r.label} amount={r.amount} minus />)
              ) : (
                <Text style={[type.body, { color: c.muted }]}>No deductions this month.</Text>
              )}
              <Total label="Total deducted" amount={data.totalDeductions} minus />
            </Card>
          </Section>

          <Text style={[type.small, { color: c.faint, textAlign: "center" }]}>Question about this payslip? Use Chat on the Me tab.</Text>
        </>
      ) : null}
    </Screen>
  );
}

function Line({ label, amount, minus }) {
  const c = useTheme();
  return (
    <View style={styles.line}>
      <Text style={[type.body, { color: c.text }]}>{label}</Text>
      <Text style={[type.body, type.figure, { color: minus ? c.bad : c.text, fontWeight: "600" }]}>
        {minus ? "−" : ""}
        {rupees(amount)}
      </Text>
    </View>
  );
}

function Total({ label, amount, minus }) {
  const c = useTheme();
  return (
    <View style={[styles.total, { borderTopColor: c.border }]}>
      <Text style={[type.heading, { color: c.text }]}>{label}</Text>
      <Text style={[type.heading, type.figure, { color: minus ? c.bad : c.text }]}>
        {minus ? "−" : ""}
        {rupees(amount)}
      </Text>
    </View>
  );
}

function Legend({ color, label, value }) {
  const c = useTheme();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
        <Text style={[type.small, { color: c.muted }]}>{label}</Text>
      </View>
      <Text style={[type.heading, type.figure, { color: c.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  split: { flexDirection: "row", height: 10, borderRadius: radius.pill, overflow: "hidden" },
  legend: { flexDirection: "row", gap: space.md },
  line: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 28 },
  total: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: StyleSheet.hairlineWidth, borderStyle: "dashed", paddingTop: space.md }
});
