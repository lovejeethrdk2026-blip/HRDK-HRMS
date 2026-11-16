import { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { elevation, radius, space, TOUCH, type, useTheme } from "./theme";

// HRDK building blocks. Every screen is made of these, so spacing, type,
// colour and touch feedback stay the same across the app. Tokens: ui/theme.js.

// A light tap felt in the hand on actions that change something.
export function tap() {
  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

// A scrolling screen with pull-to-refresh. title: a large heading at the top
// (screens without a navigation header), right: a small action beside it.
// safeTop: keep clear of the status bar / notch -- the tab screens.
export function Screen({ children, refreshing = false, onRefresh, title, subtitle, right, safeTop = false, footer }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.screen,
          safeTop ? { paddingTop: insets.top + space.md } : null,
          { paddingBottom: (footer ? 96 + (safeTop ? 30 : 0) : 0) + (safeTop ? space.xxl : insets.bottom + space.xxl) }
        ]}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brand} /> : undefined}
      >
        {title ? (
          <View style={styles.screenHead}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[type.display, { color: c.text }]} accessibilityRole="header">
                {title}
              </Text>
              {subtitle ? <Text style={[type.body, { color: c.muted }]}>{subtitle}</Text> : null}
            </View>
            {right}
          </View>
        ) : null}
        {children}
      </ScrollView>
      {footer ? (
        <View style={[styles.footer, { backgroundColor: c.bg, paddingBottom: (safeTop ? 30 : insets.bottom) + space.md /* tab screens: clear the raised centre button */, borderTopColor: c.border }]}>{footer}</View>
      ) : null}
    </View>
  );
}

// A heading for a group of content, outside the card. right: a small action.
export function Section({ title, right, children, note }) {
  const c = useTheme();
  return (
    <View style={styles.section}>
      {(title || right) && (
        <View style={styles.sectionHead}>
          <Text style={[type.heading, { color: c.text }]} accessibilityRole="header">
            {title}
          </Text>
          {right}
        </View>
      )}
      {children}
      {note ? <Text style={[type.small, { color: c.faint, paddingHorizontal: space.xs }]}>{note}</Text> : null}
    </View>
  );
}

// Raised white surface. tone: a soft brand / gold / good wash instead of white
// (hero cards). title (optional) sits inside, small and muted.
export function Card({ title, right, children, style, padded = true, tone, onPress }) {
  const c = useTheme();
  const bg = tone ? c[`${tone}Soft`] : c.card;
  const body = (
    <View style={[styles.card, padded && styles.cardPad, { backgroundColor: bg }, tone ? null : elevation(c), style]}>
      {(title || right) && (
        <View style={styles.cardHead}>
          {title ? <Text style={[type.label, { color: tone ? c[`${tone === "brand" ? "brandInk" : tone}`] : c.muted }]}>{title}</Text> : <View />}
          {right}
        </View>
      )}
      {children}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.985 : 1 }] })}>
      {body}
    </Pressable>
  );
}

// Coloured round icon (list rows, stat cards).
export function IconCircle({ name, tone = "brand", size = 36 }) {
  const c = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c[`${tone}Soft`] || c.sunk, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name={name} size={size * 0.5} color={c[tone] || c.text} />
    </View>
  );
}

// One line of a list: icon, label (and a note under it), value or action, and a
// chevron when it opens something. Rows in one card are separated by a line.
export function ListRow({ icon, iconTone = "brand", label, note, value, valueTone, onPress, last, right, strong, danger }) {
  const c = useTheme();
  const tone = valueTone ? c[valueTone] : c.text;
  const body = (
    <View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}>
      {icon ? <IconCircle name={icon} tone={danger ? "bad" : iconTone} size={34} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.body, { color: danger ? c.bad : c.text, fontWeight: strong ? "600" : "500" }]}>{label}</Text>
        {note ? <Text style={[type.small, { color: c.muted }]}>{note}</Text> : null}
      </View>
      {right ?? (value !== undefined && value !== null ? (
        <Text style={[type.body, type.figure, { color: tone, fontWeight: strong ? "700" : "600" }]}>{value}</Text>
      ) : null)}
      {onPress ? <Ionicons name="chevron-forward" size={18} color={c.faint} /> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ backgroundColor: pressed ? c.sunk : "transparent" })}>
      {body}
    </Pressable>
  );
}

// label / value pair inside a card, without a dividing line.
export function Row({ label, value, strong, tone }) {
  const c = useTheme();
  return (
    <View style={styles.kv}>
      <Text style={[type.body, { color: c.muted, flexShrink: 1 }]}>{label}</Text>
      <Text style={[type.body, type.figure, { color: tone ? c[tone] : c.text, fontWeight: strong ? "700" : "600", textAlign: "right", flexShrink: 1 }]}>
        {value}
      </Text>
    </View>
  );
}

// A number with its name under it (leave balance, month counts).
export function Tile({ value, label, tone = "brand", onPress }) {
  const c = useTheme();
  const content = (
    <View style={[styles.tile, { backgroundColor: c[`${tone}Soft`] || c.sunk }]}>
      <Text style={[type.title, type.figure, { color: c[tone] || c.text }]}>{value}</Text>
      <Text style={[type.small, { color: c[tone] || c.muted, fontWeight: "600" }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
  return onPress ? (
    <Pressable style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.75 : 1 })} onPress={onPress}>
      {content}
    </Pressable>
  ) : (
    <View style={{ flex: 1 }}>{content}</View>
  );
}

// Thin bar showing how much of something is used (0..1).
export function Progress({ share = 0, tone = "brand", height = 6 }) {
  const c = useTheme();
  return (
    <View style={{ height, borderRadius: height, backgroundColor: c.sunk, overflow: "hidden" }}>
      <View style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%`, height, borderRadius: height, backgroundColor: c[tone] }} />
    </View>
  );
}

export function Button({ title, onPress, disabled, loading, kind = "primary", icon, style, haptic = kind === "primary" }) {
  const c = useTheme();
  const look = {
    primary: { bg: c.brand, fg: "#FFFFFF", border: c.brand },
    secondary: { bg: c.card, fg: c.brand, border: c.border },
    danger: { bg: c.badSoft, fg: c.bad, border: c.badSoft },
    quiet: { bg: "transparent", fg: c.brand, border: "transparent" }
  }[kind];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      onPress={() => {
        if (haptic) tap();
        onPress?.();
      }}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: look.bg, borderColor: look.border, opacity: disabled ? 0.45 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        style
      ]}
    >
      {loading ? (
        <ActivityIndicator color={look.fg} />
      ) : (
        <View style={styles.buttonInner}>
          {icon ? <Ionicons name={icon} size={19} color={look.fg} /> : null}
          <Text style={[type.heading, { color: look.fg, fontSize: 16 }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

// Choice between a few options (Month / Week, leave types ...).
export function Segmented({ options, value, onChange }) {
  const c = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: c.sunk }]} accessibilityRole="tablist">
      {options.map(([key, label]) => {
        const on = key === value;
        return (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              tap();
              onChange(key);
            }}
            style={[styles.segment, on && [{ backgroundColor: c.card }, elevation(c)]]}
          >
            <Text style={[type.label, { color: on ? c.text : c.muted, fontWeight: on ? "700" : "500" }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Labelled text field with its own error line.
export function Field({ label, error, hint, icon, style, inputStyle, ...input }) {
  const c = useTheme();
  return (
    <View style={[{ gap: 6 }, style]}>
      {label ? <Text style={[type.label, { color: error ? c.bad : c.text, fontWeight: "600" }]}>{label}</Text> : null}
      <View style={[styles.field, { backgroundColor: c.sunk, borderColor: error ? c.bad : "transparent" }]}>
        {icon ? <Ionicons name={icon} size={19} color={c.muted} /> : null}
        <TextInput
          placeholderTextColor={c.faint}
          style={[styles.fieldInput, { color: c.text }, input.multiline && { minHeight: 84, textAlignVertical: "top", paddingTop: 12 }, inputStyle]}
          accessibilityLabel={label}
          {...input}
        />
      </View>
      {error ? <Text style={[type.small, { color: c.bad }]}>{error}</Text> : hint ? <Text style={[type.small, { color: c.faint }]}>{hint}</Text> : null}
    </View>
  );
}

// Status word on a soft colour.
export function Pill({ text, tone = "info", icon }) {
  const c = useTheme();
  const fg = c[tone] || c.muted;
  return (
    <View style={[styles.pill, { backgroundColor: c[`${tone}Soft`] || c.sunk }]}>
      {icon ? <Ionicons name={icon} size={12} color={fg} /> : null}
      <Text style={[type.small, { color: fg, fontWeight: "700" }]}>{text}</Text>
    </View>
  );
}

// Nothing to show yet, and what to do about it.
export function Empty({ icon = "document-text-outline", title, text, action }) {
  const c = useTheme();
  return (
    <View style={styles.empty}>
      <IconCircle name={icon} tone="brand" size={52} />
      {title ? <Text style={[type.heading, { color: c.text, textAlign: "center" }]}>{title}</Text> : null}
      {text ? <Text style={[type.body, { color: c.muted, textAlign: "center" }]}>{text}</Text> : null}
      {action}
    </View>
  );
}

// Grey placeholder block that gently pulses while data loads.
export function Skeleton({ height = 16, width = "100%", radius: r = 8, style }) {
  const c = useTheme();
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== "web" }),
        Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: Platform.OS !== "web" })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View style={[{ height, width, borderRadius: r, backgroundColor: c.sunk, opacity: pulse }, style]} />;
}

// A whole screen of placeholders, shaped like cards.
export function LoadingCards({ count = 3 }) {
  const c = useTheme();
  return (
    <View style={{ gap: space.lg }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.card, styles.cardPad, { backgroundColor: c.card }, elevation(c)]}>
          <Skeleton width="45%" />
          <Skeleton height={28} width="70%" />
          <Skeleton width="90%" />
        </View>
      ))}
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
  return (
    <View style={[styles.error, { backgroundColor: c.badSoft }]} accessibilityRole="alert">
      <Ionicons name="alert-circle" size={18} color={c.bad} />
      <Text style={[type.label, { color: c.bad, flex: 1 }]}>{error}</Text>
    </View>
  );
}

export const STATUS_TONE = { Approved: "good", Pending: "warn", Rejected: "bad", Cancelled: "muted" };

export const rupees = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
export const showDate = (iso) => (iso ? iso.split("-").reverse().join("-") : "");
export const monthName = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
};
export const monthShort = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-IN", { month: "short" });
};
// "Fri, 14 Nov"
export const dayName = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
};
// "14 Nov 2026"
export const niceDate = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

const styles = StyleSheet.create({
  screen: { padding: space.lg, gap: space.xl },
  screenHead: { flexDirection: "row", alignItems: "flex-end", gap: space.md, paddingTop: space.sm },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space.lg, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth },
  section: { gap: space.md },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: space.xs },
  card: { borderRadius: radius.card, gap: space.md },
  cardPad: { padding: space.lg + 2 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md, paddingHorizontal: space.lg, minHeight: 60 },
  kv: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.md, minHeight: 24 },
  tile: { borderRadius: radius.inner, paddingVertical: space.md, paddingHorizontal: space.sm, alignItems: "center", gap: 2 },
  button: { borderWidth: 1, borderRadius: radius.control, paddingHorizontal: space.lg, alignItems: "center", minHeight: 52, justifyContent: "center" },
  buttonInner: { flexDirection: "row", alignItems: "center", gap: space.sm },
  segmented: { flexDirection: "row", borderRadius: radius.control, padding: 4, gap: 4 },
  segment: { flex: 1, minHeight: 38, borderRadius: radius.control - 4, alignItems: "center", justifyContent: "center" },
  field: { flexDirection: "row", alignItems: "center", gap: space.sm, borderRadius: radius.control, borderWidth: 1.5, paddingHorizontal: space.md, minHeight: 52 },
  fieldInput: { flex: 1, fontSize: 16, paddingVertical: 12 },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start" },
  empty: { alignItems: "center", gap: space.sm, paddingVertical: space.xl, paddingHorizontal: space.lg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  error: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, borderRadius: radius.inner },
  // keep TOUCH referenced for screens that size their own targets
  touch: { minHeight: TOUCH, minWidth: TOUCH }
});
