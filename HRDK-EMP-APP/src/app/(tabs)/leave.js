import { Alert, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { cancelLeave, getLeave } from "../../api/me";
import { Button, Card, ErrorText, Pill, STATUS_TONE, Screen, showDate } from "../../ui/components";
import { useLoad } from "../../ui/useLoad";
import { useTheme } from "../../ui/theme";

// Leave: balance per type, Apply leave, and every application with its status.
// A request goes to the employee's manager as Pending (Leave page in ADMIN).
export default function Leave() {
  const c = useTheme();
  const { data, error, loading, reload } = useLoad(getLeave, []);

  // Back from Apply leave: show the new request.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  function askCancel(app) {
    Alert.alert("Cancel this leave?", `${app.type}, ${showDate(app.fromDate)}${app.toDate !== app.fromDate ? ` to ${showDate(app.toDate)}` : ""}`, [
      { text: "Keep", style: "cancel" },
      {
        text: "Cancel leave",
        style: "destructive",
        onPress: async () => {
          try {
            await cancelLeave(app._id);
            reload();
          } catch (err) {
            Alert.alert("Couldn't cancel", err.message);
          }
        }
      }
    ]);
  }

  const typeName = (code) => data?.types.find((t) => t.code === code)?.name || code;

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <ErrorText error={error} />

      <Card title={`Balance · FY ${data?.fy ?? ""}-${String((data?.fy || 0) + 1).slice(2)}`}>
        {(data?.types || []).map((t) => {
          const b = data.balances[t.code] || {};
          return (
            <View key={t.code} style={styles.balance}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.typeName, { color: c.text }]}>{t.name}</Text>
                <Text style={{ color: c.muted, fontSize: 13 }}>
                  {t.yearlyDays ? `${t.yearlyDays} a year · taken ${b.used || 0}` : `No limit · taken ${b.used || 0}`}
                  {b.pending ? ` · pending ${b.pending}` : ""}
                </Text>
              </View>
              <Text style={[styles.left, { color: c.brand }]}>{b.left ?? "–"}</Text>
            </View>
          );
        })}
        <Button title="Apply leave" onPress={() => router.push("/apply-leave")} />
      </Card>

      <Card title="My applications">
        {!data?.applications.length ? (
          <Text style={{ color: c.muted }}>No leave applied yet.</Text>
        ) : (
          data.applications.map((app) => (
            <View key={app._id} style={[styles.app, { borderTopColor: c.border }]}>
              <View style={styles.appHead}>
                <Text style={[styles.typeName, { color: c.text }]}>
                  {typeName(app.type)}
                  {app.halfDay ? " (half day)" : ""}
                </Text>
                <Pill text={app.status} tone={STATUS_TONE[app.status]} />
              </View>
              <Text style={{ color: c.text }}>
                {showDate(app.fromDate)}
                {app.toDate !== app.fromDate ? ` – ${showDate(app.toDate)}` : ""} · {app.days} day{app.days === 1 ? "" : "s"}
              </Text>
              <Text style={{ color: c.muted }}>{app.reason}</Text>
              {app.remarks ? <Text style={{ color: c.muted }}>Remark: {app.remarks}</Text> : null}
              {app.status === "Pending" && <Button title="Cancel request" kind="danger" onPress={() => askCancel(app)} />}
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  balance: { flexDirection: "row", alignItems: "center", gap: 12 },
  typeName: { fontSize: 15, fontWeight: "600" },
  left: { fontSize: 24, fontWeight: "700", minWidth: 40, textAlign: "right" },
  app: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 4 },
  appHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }
});
