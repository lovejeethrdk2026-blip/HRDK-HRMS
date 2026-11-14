import { Text } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { getPayslip } from "../../api/me";
import { Card, ErrorText, Loading, Row, Screen, monthName, rupees } from "../../ui/components";
import { useLoad } from "../../ui/useLoad";
import { useTheme } from "../../ui/theme";

// One month's payslip: earnings, deductions and net pay (only the
// logged-in employee's own row; the server decides that from the login key).
export default function Payslip() {
  const c = useTheme();
  const { month } = useLocalSearchParams();
  const { data, error, loading } = useLoad(() => getPayslip(month), [month]);

  if (loading && !data) return <Loading />;
  const sum = (rows) => (rows || []).reduce((s, r) => s + Number(r.amount || 0), 0);

  return (
    <Screen>
      <Stack.Screen options={{ title: monthName(month) }} />
      <ErrorText error={error} />
      {data && (
        <>
          <Card title="Net pay">
            <Text style={{ color: c.brand, fontSize: 32, fontWeight: "700" }}>{rupees(data.net)}</Text>
            {data.paidDays ? <Text style={{ color: c.muted }}>Paid days: {data.paidDays}</Text> : null}
          </Card>
          <Card title="Earnings">
            {data.earnings.map((r) => (
              <Row key={r.label} label={r.label} value={rupees(r.amount)} />
            ))}
            <Row label="Total earnings" value={rupees(sum(data.earnings))} strong />
          </Card>
          <Card title="Deductions">
            {data.deductions.map((r) => (
              <Row key={r.label} label={r.label} value={rupees(r.amount)} />
            ))}
            <Row label="Total deductions" value={rupees(sum(data.deductions))} strong />
          </Card>
        </>
      )}
    </Screen>
  );
}
