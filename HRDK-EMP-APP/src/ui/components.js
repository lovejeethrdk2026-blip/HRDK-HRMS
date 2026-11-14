import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "./theme";

// Small building blocks shared by every screen.

export function Screen({ children, refreshing = false, onRefresh }) {
  const c = useTheme();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={styles.screen}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brand} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

export function Card({ title, right, children, style }) {
  const c = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }, style]}>
      {(title || right) && (
        <View style={styles.cardHead}>
          {title ? <Text style={[styles.cardTitle, { color: c.muted }]}>{title}</Text> : <View />}
          {right}
        </View>
      )}
      {children}
    </View>
  );
}

export function Button({ title, onPress, disabled, loading, kind = "primary", style }) {
  const c = useTheme();
  const primary = kind === "primary";
  const danger = kind === "danger";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: primary ? c.brand : "transparent",
          borderColor: danger ? c.bad : c.brand,
          opacity: disabled ? 0.5 : pressed ? 0.8 : 1
        },
        style
      ]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? "#fff" : c.brand} />
      ) : (
        <Text style={[styles.buttonText, { color: primary ? "#fff" : danger ? c.bad : c.brand }]}>{title}</Text>
      )}
    </Pressable>
  );
}

// "Approved", "Pending", ... as a coloured tag.
export function Pill({ text, tone = "info" }) {
  const c = useTheme();
  const tones = {
    good: [c.goodSoft, c.good],
    warn: [c.warnSoft, c.warn],
    bad: [c.badSoft, c.bad],
    info: [c.infoSoft, c.info],
    muted: [c.border, c.muted]
  };
  const [bg, fg] = tones[tone] || tones.info;
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color: fg }]}>{text}</Text>
    </View>
  );
}

export function Loading() {
  const c = useTheme();
  return (
    <View style={[styles.center, { backgroundColor: c.bg }]}>
      <ActivityIndicator size="large" color={c.brand} />
    </View>
  );
}

export function ErrorText({ error }) {
  const c = useTheme();
  if (!error) return null;
  return <Text style={[styles.error, { color: c.bad, backgroundColor: c.badSoft }]}>{error}</Text>;
}

export function Row({ label, value, strong }) {
  const c = useTheme();
  return (
    <View style={styles.row}>
      <Text style={{ color: c.muted, fontSize: 14 }}>{label}</Text>
      <Text style={{ color: c.text, fontSize: 14, fontWeight: strong ? "700" : "500" }}>{value}</Text>
    </View>
  );
}

export const STATUS_TONE = { Approved: "good", Pending: "warn", Rejected: "bad", Cancelled: "muted" };

export const rupees = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
export const showDate = (iso) => (iso ? iso.split("-").reverse().join("-") : "");
export const monthName = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
};

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 14, paddingBottom: 32 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 16, gap: 10 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontSize: 12, fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase" },
  button: { borderWidth: 1.5, borderRadius: 10, paddingVertical: 13, paddingHorizontal: 18, alignItems: "center" },
  buttonText: { fontSize: 16, fontWeight: "600" },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: "flex-start" },
  pillText: { fontSize: 12, fontWeight: "600" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  error: { padding: 12, borderRadius: 10, fontSize: 14 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }
});
