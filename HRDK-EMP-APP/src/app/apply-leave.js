import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { applyLeave, getLeave } from "../api/me";
import { Button, Card, ErrorText, Loading, Screen } from "../ui/components";
import { useLoad } from "../ui/useLoad";
import { useTheme } from "../ui/theme";

const pad = (n) => String(n).padStart(2, "0");
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (iso, n) => {
  const [y, m, d] = iso.split("-").map(Number);
  return isoOf(new Date(y, m - 1, d + n));
};
const label = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
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

// A date with − / + buttons: no native date picker package needed.
function DateStepper({ title, value, onChange, min }) {
  const c = useTheme();
  const btn = [styles.step, { borderColor: c.border }];
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.label, { color: c.muted }]}>{title}</Text>
      <View style={styles.stepper}>
        <Pressable style={btn} onPress={() => (!min || addDays(value, -1) >= min) && onChange(addDays(value, -1))} hitSlop={6}>
          <Text style={[styles.stepText, { color: c.brand }]}>−</Text>
        </Pressable>
        <Text style={[styles.dateText, { color: c.text }]}>{label(value)}</Text>
        <Pressable style={btn} onPress={() => onChange(addDays(value, 1))} hitSlop={6}>
          <Text style={[styles.stepText, { color: c.brand }]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

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

  const types = useMemo(() => (data?.types || []).filter((t) => t.active !== false), [data]);
  const chosen = type || types[0]?.code || "";
  const end = halfDay ? fromDate : toDate < fromDate ? fromDate : toDate;
  const days = countDays(fromDate, end, halfDay);
  const left = data?.balances[chosen]?.left;

  if (!data && !loadError) return <Loading />;

  async function submit() {
    if (!reason.trim()) return setError("Write the reason");
    if (!days) return setError("Those dates are all Sundays");
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
    <Screen>
      <ErrorText error={loadError} />
      <Card title="Leave type">
        <View style={styles.types}>
          {types.map((t) => {
            const active = t.code === chosen;
            return (
              <Pressable
                key={t.code}
                onPress={() => setType(t.code)}
                style={[styles.type, { borderColor: active ? c.brand : c.border, backgroundColor: active ? c.brandSoft : "transparent" }]}
              >
                <Text style={{ color: active ? c.brand : c.text, fontWeight: "700" }}>{t.code}</Text>
                <Text style={{ color: c.muted, fontSize: 12 }}>
                  {data.balances[t.code]?.left ?? "∞"} left
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card title="Dates">
        <DateStepper
          title="From"
          value={fromDate}
          onChange={(v) => {
            setFromDate(v);
            if (toDate < v) setToDate(v);
          }}
        />
        {!halfDay && <DateStepper title="To" value={end} onChange={setToDate} min={fromDate} />}
        <View style={styles.half}>
          <Text style={{ color: c.text, fontSize: 15 }}>Half day</Text>
          <Switch value={halfDay} onValueChange={setHalfDay} trackColor={{ true: c.brand }} />
        </View>
        <Text style={{ color: left !== null && left !== undefined && days > left ? c.bad : c.muted }}>
          {days} day{days === 1 ? "" : "s"} (Sundays not counted)
          {left !== null && left !== undefined ? ` · ${chosen} left: ${left}` : ""}
        </Text>
      </Card>

      <Card title="Reason">
        <TextInput
          style={[styles.reason, { color: c.text, borderColor: c.border }]}
          placeholder="Why do you need leave?"
          placeholderTextColor={c.muted}
          multiline
          value={reason}
          onChangeText={setReason}
        />
      </Card>

      <ErrorText error={error} />
      <Button title="Send to manager" onPress={submit} loading={saving} disabled={!chosen} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.6 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 10 },
  step: { width: 44, height: 44, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  stepText: { fontSize: 22, fontWeight: "600" },
  dateText: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "600" },
  types: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  type: { borderWidth: 1.5, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, alignItems: "center", minWidth: 72 },
  half: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  reason: { borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 90, textAlignVertical: "top", fontSize: 15 }
});
