import { useCallback } from "react";
import { Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { cancelLeave, getLeave } from "../../api/me";
import Ring from "../../ui/Ring";
import { useFeatures } from "../../auth/AuthContext";
import { Button, Card, Empty, ErrorText, LoadingCards, niceDate, Pill, Screen, Section, STATUS_TONE, tap } from "../../ui/components";
import { useLoad } from "../../ui/useLoad";
import { radius, space, type, useTheme } from "../../ui/theme";

const ask = (title, message) =>
  Platform.OS === "web"
    ? Promise.resolve(window.confirm(`${title}\n\n${message}`))
    : new Promise((resolve) =>
        Alert.alert(title, message, [
          { text: "Keep it", style: "cancel", onPress: () => resolve(false) },
          { text: "Cancel request", style: "destructive", onPress: () => resolve(true) }
        ])
      );

const STATUS_WORD = { Pending: "Waiting for approval", Approved: "Approved", Rejected: "Not approved", Cancelled: "Cancelled" };
const TYPE_TONE = { CL: "brand", SL: "good", PL: "gold" };

// Leave: what is left of each type this year (rings), and every request with
// where it stands. Apply leave stays pinned at the bottom.
export default function Leave() {
  const c = useTheme();
  const { leaveApply } = useFeatures(); // HR can switch applying off
  const { data, error, loading, reload } = useLoad(getLeave, [], { live: ["leave"] });

  // Back from Apply leave: show the new request.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  async function askCancel(app) {
    const ok = await ask("Cancel this request?", `${app.type}, ${niceDate(app.fromDate)}${app.toDate !== app.fromDate ? ` to ${niceDate(app.toDate)}` : ""}`);
    if (!ok) return;
    try {
      await cancelLeave(app._id);
      reload();
    } catch (err) {
      Platform.OS === "web" ? window.alert(err.message) : Alert.alert("Couldn't cancel", err.message);
    }
  }

  const typeName = (code) => data?.types.find((t) => t.code === code)?.name || code;
  const limited = (data?.types || []).filter((t) => t.yearlyDays > 0);
  const unlimited = (data?.types || []).filter((t) => !t.yearlyDays);
  const pending = (data?.applications || []).filter((a) => a.status === "Pending");
  const history = (data?.applications || []).filter((a) => a.status !== "Pending");
  const fy = data ? `Financial year ${data.fy}-${String(data.fy + 1).slice(2)}` : "";

  return (
    <Screen
      safeTop
      title="Leave"
      subtitle={fy}
      refreshing={loading}
      onRefresh={reload}
      footer={leaveApply ? <Button title="Apply leave" icon="add" onPress={() => router.push("/apply-leave")} /> : null}
    >
      <ErrorText error={error} />

      {!data && loading ? (
        <LoadingCards count={2} />
      ) : (
        <>
          <Card>
            <View style={styles.rings}>
              {limited.map((t) => {
                const b = data.balances[t.code] || {};
                const total = t.yearlyDays + (b.adjust || 0);
                return (
                  <Pressable
                    key={t.code}
                    style={styles.ringCell}
                    disabled={!leaveApply}
                    onPress={() => {
                      tap();
                      router.push("/apply-leave");
                    }}
                    accessibilityLabel={`${t.name}: ${b.left} of ${total} left, ${b.used || 0} taken${b.pending ? `, ${b.pending} waiting for approval` : ""}`}
                  >
                    <Ring share={total ? (b.left ?? 0) / total : 0} size={86} stroke={9} value={String(b.left ?? "–")} unit={`of ${total}`} color={c[TYPE_TONE[t.code] || "brand"]} track={c.sunk} />
                    <Text style={[type.label, { color: c.text, fontWeight: "600", textAlign: "center" }]} numberOfLines={1}>
                      {t.name.replace(" Leave", "")}
                    </Text>
                    <Text style={[type.small, { color: c.muted }]}>Left {b.left ?? "–"} of {total}</Text>
                    <Text style={[type.small, type.figure, { color: c.faint }]}>Taken {b.used || 0}</Text>
                    {b.pending ? <Text style={[type.small, type.figure, { color: c.warn }]}>Waiting {b.pending}</Text> : null}
                  </Pressable>
                );
              })}
            </View>
            {unlimited.map((t) => (
              <View key={t.code} style={[styles.unlimited, { backgroundColor: c.sunk }]}>
                <Text style={[type.label, { color: c.text, flex: 1 }]}>{t.name}</Text>
                <Text style={[type.small, { color: c.muted }]}>No yearly limit, taken {data.balances[t.code]?.used || 0}</Text>
              </View>
            ))}
          </Card>

          {pending.length > 0 && (
            <Section title="Waiting for approval">
              {pending.map((app) => (
                <Request key={app._id} app={app} typeName={typeName} onCancel={leaveApply ? () => askCancel(app) : undefined} />
              ))}
            </Section>
          )}

          <Section title="History">
            {history.length ? (
              history.map((app) => <Request key={app._id} app={app} typeName={typeName} />)
            ) : (
              <Card>
                <Empty icon="airplane-outline" title="No leave taken yet" text="Requests you send show here with their status." />
              </Card>
            )}
          </Section>
        </>
      )}
    </Screen>
  );
}

function Request({ app, typeName, onCancel }) {
  const c = useTheme();
  const tone = STATUS_TONE[app.status] || "muted";
  return (
    <Card style={{ paddingLeft: space.lg + 6 }}>
      <View style={[styles.stripe, { backgroundColor: tone === "muted" ? c.border : c[tone] }]} />
      <View style={styles.reqHead}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.heading, { color: c.text }]}>
            {typeName(app.type)}
            {app.halfDay ? ", half day" : ""}
          </Text>
          <Text style={[type.label, type.figure, { color: c.muted }]}>
            {niceDate(app.fromDate)}
            {app.toDate !== app.fromDate ? ` to ${niceDate(app.toDate)}` : ""}
          </Text>
        </View>
        <View style={[styles.days, { backgroundColor: c.sunk }]}>
          <Text style={[type.heading, type.figure, { color: c.text }]}>{app.days}</Text>
          <Text style={[type.small, { color: c.muted }]}>day{app.days === 1 ? "" : "s"}</Text>
        </View>
      </View>
      {app.reason ? <Text style={[type.body, { color: c.text }]}>{app.reason}</Text> : null}
      <Pill text={STATUS_WORD[app.status] || app.status} tone={tone} />
      {app.remarks ? <Text style={[type.label, { color: c.muted }]}>Note: {app.remarks}</Text> : null}
      {onCancel ? <Button title="Cancel request" kind="danger" onPress={onCancel} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  rings: { flexDirection: "row", justifyContent: "space-around", gap: space.sm },
  ringCell: { alignItems: "center", gap: 4, flex: 1 },
  unlimited: { flexDirection: "row", alignItems: "center", gap: space.sm, borderRadius: radius.inner, padding: space.md },
  stripe: { position: "absolute", left: 0, top: 14, bottom: 14, width: 4, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  reqHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  days: { borderRadius: radius.inner, paddingVertical: 6, paddingHorizontal: space.md, alignItems: "center" }
});
