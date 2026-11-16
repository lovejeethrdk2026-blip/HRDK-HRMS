import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { applyLeave, getLeave } from "../api/me";
import { Button, Card, ErrorText, Field, LoadingCards, niceDate, Screen, Section, tap } from "../ui/components";
import { useLoad } from "../ui/useLoad";
import { radius, space, TOUCH, type, useTheme } from "../ui/theme";

const pad = (n) => String(n).padStart(2, "0");
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (iso, n) => {
  const [y, m, d] = iso.split("-").map(Number);
  return isoOf(new Date(y, m - 1, d + n));
};
const weekday = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { weekday: "long" });
};

// Sundays are the weekly off and not counted (same rule as the server).
function countDays(from, to, half) {
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const [y, m, dd] = d.split("-").map(Number);
    if (new Date(y, m - 1, dd).getDay() !== 0) n += half ? 0.5 : 1;
  }
  return n;
}

// A date with - / + buttons (no native date picker needed), big enough to tap.
function DateStepper({ title, value, onChange, min }) {
  const c = useTheme();
  const canBack = !min || addDays(value, -1) >= min;
  const step = (by) => {
    tap();
    onChange(addDays(value, by));
  };
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text style={[type.label, { color: c.muted, fontWeight: "600" }]}>{title}</Text>
      <View style={[styles.stepper, { backgroundColor: c.sunk }]}>
        <Pressable onPress={() => canBack && step(-1)} disabled={!canBack} style={styles.step} accessibilityLabel={`${title}: one day earlier`}>
          <Ionicons name="remove" size={20} color={canBack ? c.brand : c.border} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={[type.heading, type.figure, { color: c.text }]}>{niceDate(value).replace(/ \d{4}$/, "")}</Text>
          <Text style={[type.small, { color: c.muted }]}>{weekday(value)}</Text>
        </View>
        <Pressable onPress={() => step(1)} style={styles.step} accessibilityLabel={`${title}: one day later`}>
          <Ionicons name="add" size={20} color={c.brand} />
        </Pressable>
      </View>
    </View>
  );
}

// Apply leave: pick the type (with what's left), the dates, half day, the
// reason; the summary shows the days it takes. Send goes to the manager / HR
// as "Waiting for approval".
export default function ApplyLeave() {
  const c = useTheme();
  const { data, error: loadError } = useLoad(getLeave, []);
  const today = isoOf(new Date());
  const [type, setType] = useState("");
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reasonError, setReasonError] = useState("");

  const types = useMemo(() => (data?.types || []).filter((t) => t.active !== false), [data]);
  const chosen = type || types[0]?.code || "";
  const end = halfDay ? fromDate : toDate < fromDate ? fromDate : toDate;
  const days = countDays(fromDate, end, halfDay);
  const left = data?.balances[chosen]?.left;
  const over = left !== null && left !== undefined && days > left;

  async function submit() {
    if (!reason.trim()) return setReasonError("Write why you need leave");
    if (!days) return setError("Those dates are all Sundays, so no leave is needed.");
    setSaving(true);
    setError("");
    try {
      await applyLeave({ type: chosen, fromDate, toDate: end, halfDay, reason: reason.trim() });
      router.back();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Screen footer={data ? <Button title={`Send for approval${days ? ` · ${days} day${days === 1 ? "" : "s"}` : ""}`} icon="send" onPress={submit} loading={saving} disabled={!chosen || over} /> : null}>
      <ErrorText error={loadError} />
      {!data && !loadError ? (
        <LoadingCards count={2} />
      ) : (
        <>
          <Section title="Type of leave">
            <View style={styles.types}>
              {types.map((t) => {
                const on = t.code === chosen;
                const l = data.balances[t.code]?.left;
                return (
                  <Pressable
                    key={t.code}
                    onPress={() => {
                      tap();
                      setType(t.code);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    style={[styles.type, { backgroundColor: on ? c.brand : c.card, borderColor: on ? c.brand : c.border }]}
                  >
                    <Text style={[type.heading, { color: on ? "#FFFFFF" : c.text }]} numberOfLines={1}>
                      {t.name.replace(" Leave", "")}
                    </Text>
                    <Text style={[type.small, { color: on ? "rgba(255,255,255,0.85)" : c.muted }]}>{l === null || l === undefined ? "No limit" : `${l} left`}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Section>

          <Section title="Dates">
            <Card>
              <View style={styles.dates}>
                <DateStepper
                  title="From"
                  value={fromDate}
                  onChange={(v) => {
                    setFromDate(v);
                    if (toDate < v) setToDate(v);
                  }}
                />
                {!halfDay && <DateStepper title="To" value={end} onChange={setToDate} min={fromDate} />}
              </View>
              <View style={[styles.half, { borderTopColor: c.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, { color: c.text, fontWeight: "600" }]}>Half day</Text>
                  <Text style={[type.small, { color: c.muted }]}>Only for one date</Text>
                </View>
                <Switch
                  value={halfDay}
                  onValueChange={(v) => {
                    tap();
                    setHalfDay(v);
                  }}
                  trackColor={{ true: c.brand, false: c.border }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </Card>
          </Section>

          <Field
            label="Reason"
            placeholder="For example: family function, doctor visit"
            value={reason}
            onChangeText={(t) => {
              setReason(t);
              if (reasonError) setReasonError("");
            }}
            multiline
            error={reasonError}
          />

          <Card tone={over ? "bad" : "brand"}>
            <View style={styles.summary}>
              <Ionicons name={over ? "alert-circle" : "calendar"} size={22} color={over ? c.bad : c.brand} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.heading, { color: over ? c.bad : c.brandInk }]}>
                  {days} day{days === 1 ? "" : "s"} of {types.find((t) => t.code === chosen)?.name || "leave"}
                </Text>
                <Text style={[type.small, { color: over ? c.bad : c.brandInk, opacity: 0.85 }]}>
                  {over
                    ? `Only ${left} left. Pick fewer days or another type.`
                    : `${niceDate(fromDate)}${end !== fromDate ? ` to ${niceDate(end)}` : ""}. Sundays are not counted.`}
                </Text>
              </View>
            </View>
          </Card>

          <ErrorText error={error} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  types: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  type: { flexBasis: "47%", flexGrow: 1, borderWidth: 1.5, borderRadius: radius.inner, paddingVertical: space.md, paddingHorizontal: space.md, gap: 2, minHeight: 64 },
  dates: { flexDirection: "row", gap: space.sm },
  stepper: { flexDirection: "row", alignItems: "center", borderRadius: radius.inner, paddingVertical: 4 },
  step: { width: TOUCH, height: TOUCH, alignItems: "center", justifyContent: "center" },
  half: { flexDirection: "row", alignItems: "center", gap: space.md, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.md },
  summary: { flexDirection: "row", alignItems: "center", gap: space.md }
});
