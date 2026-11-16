import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getPayslips } from "../../api/me";
import { Card, Empty, ErrorText, ListRow, LoadingCards, monthName, monthShort, rupees, Screen, Section, tap } from "../../ui/components";
import { useLoad } from "../../ui/useLoad";
import { radius, space, type, useTheme } from "../../ui/theme";

// Salary: the last month paid in hand as the headline (and how it moved from
// the month before), a bar per month to see the trend, and every payslip.
export default function Salary() {
  const c = useTheme();
  const { data, error, loading, reload } = useLoad(getPayslips, []);
  const slips = (data || []).filter((p) => p.released); // newest first
  const [focus, setFocus] = useState(null);
  const latest = slips[0];
  const previous = slips[1];
  const change = latest && previous ? latest.net - previous.net : null;
  const bars = [...slips].slice(0, 6).reverse(); // oldest -> newest
  // Bars run from the lowest to the highest month, so a ₹2,000 change on
  // ₹17,000 still shows; the lowest bar keeps a 30% stub.
  const max = Math.max(1, ...bars.map((b) => b.net));
  const min = Math.min(...bars.map((b) => b.net));
  const heightOf = (net) => (max === min ? 70 : 30 + ((net - min) / (max - min)) * 70);
  const shown = bars.find((b) => b.month === focus) || latest;

  return (
    <Screen safeTop title="Salary" subtitle="Paid in hand each month" refreshing={loading} onRefresh={reload}>
      <ErrorText error={error} />

      {!data && loading ? (
        <LoadingCards count={2} />
      ) : !slips.length ? (
        <Card>
          <Empty icon="wallet-outline" title="No payslip yet" text="Each month shows here once payroll is done." />
        </Card>
      ) : (
        <>
          <Card tone="gold" onPress={() => router.push(`/payslip/${shown.month}`)}>
            <View style={styles.heroHead}>
              <Text style={[type.label, { color: c.gold, fontWeight: "700" }]}>{monthName(shown.month)}</Text>
              <Ionicons name="chevron-forward" size={18} color={c.gold} />
            </View>
            <Text style={[type.hero, type.figure, { color: c.text }]}>{rupees(shown.net)}</Text>
            {shown === latest && change !== null ? (
              <View style={styles.change}>
                <Ionicons name={change >= 0 ? "arrow-up" : "arrow-down"} size={14} color={change >= 0 ? c.good : c.bad} />
                <Text style={[type.label, { color: change >= 0 ? c.good : c.bad, fontWeight: "700" }]}>
                  {rupees(Math.abs(change))} {change >= 0 ? "more" : "less"} than {monthShort(previous.month)}
                </Text>
              </View>
            ) : (
              <Text style={[type.label, { color: c.muted }]}>Tap for the full payslip</Text>
            )}

            {bars.length > 1 && (
              <View style={styles.chart} accessibilityLabel="Paid in hand, last months">
                {bars.map((b) => {
                  const on = b.month === shown.month;
                  return (
                    <Pressable
                      key={b.month}
                      style={styles.barCol}
                      onPress={() => {
                        tap();
                        setFocus(b.month);
                      }}
                      accessibilityLabel={`${monthName(b.month)}: ${rupees(b.net)}`}
                    >
                      <View style={styles.barTrack}>
                        <View style={[styles.bar, { height: `${heightOf(b.net)}%`, backgroundColor: on ? c.gold : c.card }]} />
                      </View>
                      <Text style={[type.small, { color: on ? c.gold : c.muted, fontWeight: on ? "700" : "500" }]}>{monthShort(b.month)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </Card>

          <Section title="All payslips">
            <Card padded={false}>
              {slips.map((p, i) => (
                <ListRow
                  key={p.month}
                  icon="receipt-outline"
                  iconTone="gold"
                  label={monthName(p.month)}
                  value={rupees(p.net)}
                  onPress={() => router.push(`/payslip/${p.month}`)}
                  last={i === slips.length - 1}
                />
              ))}
            </Card>
          </Section>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  change: { flexDirection: "row", alignItems: "center", gap: 4 },
  chart: { flexDirection: "row", alignItems: "flex-end", gap: space.sm, height: 120, marginTop: space.sm },
  barCol: { flex: 1, alignItems: "center", gap: 6, height: "100%" },
  barTrack: { flex: 1, width: "100%", justifyContent: "flex-end" },
  bar: { width: "100%", borderRadius: radius.inner - 4 }
});
