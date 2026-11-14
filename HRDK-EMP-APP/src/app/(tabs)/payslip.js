import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { getPayslips } from "../../api/me";
import { Card, ErrorText, Screen, monthName, rupees } from "../../ui/components";
import { useLoad } from "../../ui/useLoad";
import { useTheme } from "../../ui/theme";

// Payslips: every month HR has released; tap one for the full slip.
export default function Payslips() {
  const c = useTheme();
  const { data, error, loading, reload } = useLoad(getPayslips, []);
  const released = (data || []).filter((p) => p.released);

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <ErrorText error={error} />
      <Card title="Released payslips">
        {!released.length && !loading ? (
          <Text style={{ color: c.muted }}>No payslip released yet. HR releases each month after payroll is final.</Text>
        ) : (
          released.map((p) => (
            <Pressable
              key={p.month}
              onPress={() => router.push(`/payslip/${p.month}`)}
              style={({ pressed }) => [styles.item, { borderTopColor: c.border, opacity: pressed ? 0.6 : 1 }]}
            >
              <View>
                <Text style={[styles.month, { color: c.text }]}>{monthName(p.month)}</Text>
                <Text style={{ color: c.muted, fontSize: 13 }}>Net pay</Text>
              </View>
              <Text style={[styles.net, { color: c.brand }]}>{rupees(p.net)} ›</Text>
            </Pressable>
          ))
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  month: { fontSize: 16, fontWeight: "600" },
  net: { fontSize: 17, fontWeight: "700" }
});
