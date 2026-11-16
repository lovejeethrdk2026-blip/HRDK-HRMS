import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getChat, sendChat } from "../api/me";
import { Empty, ErrorText, Loading, tap } from "../ui/components";
import { elevation, radius, space, type, useTheme } from "../ui/theme";

// Chat with my manager and HR: my messages on the right, theirs on the left,
// grouped by day. New replies are fetched every few seconds while the screen
// is open. They answer from the ADMIN website (Messages); nobody else can read it.

const POLL_MS = 6000;

const clock = (at) => new Date(at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
function dayLabel(at) {
  const d = new Date(at);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" });
}

export default function Chat() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState(null); // { manager, messages }
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);

  const load = useCallback(async () => {
    try {
      setData(await getChat());
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  // Messages with a day heading before the first message of each day.
  const items = useMemo(() => {
    const out = [];
    let lastDay = "";
    for (const m of data?.messages || []) {
      const label = dayLabel(m.createdAt);
      if (label !== lastDay) {
        out.push({ _id: `day-${label}`, day: label });
        lastDay = label;
      }
      out.push(m);
    }
    return out;
  }, [data]);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    tap();
    setSending(true);
    try {
      await sendChat(body);
      setText("");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  if (!data && !error) return <Loading />;
  const managerName = String(data?.manager || "")
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
  const readers = managerName ? `${managerName} and HR` : "HR";
  const canSend = Boolean(text.trim()) && !sending;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <Stack.Screen options={{ title: managerName || "Chat" }} />
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(m) => m._id}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListHeaderComponent={
          <View style={{ gap: space.sm, marginBottom: space.sm }}>
            <ErrorText error={error} />
            <View style={[styles.banner, { backgroundColor: c.brandSoft }]}>
              <Ionicons name="lock-closed" size={14} color={c.brandInk} />
              <Text style={[type.small, { color: c.brandInk, flex: 1 }]}>Only {readers} can read this chat.</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <Empty
            icon="chatbubbles-outline"
            title="Start the conversation"
            text={`Ask ${readers} about attendance, leave or pay. They reply here.`}
          />
        }
        renderItem={({ item: m }) => {
          if (m.day) {
            return (
              <View style={styles.dayRow}>
                <View style={[styles.dayPill, { backgroundColor: c.sunk }]}>
                  <Text style={[type.small, { color: c.muted, fontWeight: "600" }]}>{m.day}</Text>
                </View>
              </View>
            );
          }
          const mine = m.from === "employee";
          return (
            <View style={[styles.row, mine && styles.rowMine]}>
              <View
                style={[
                  styles.bubble,
                  mine ? { backgroundColor: c.brand, borderBottomRightRadius: 6 } : [{ backgroundColor: c.card, borderBottomLeftRadius: 6 }, elevation(c)]
                ]}
              >
                {!mine ? (
                  <Text style={[type.small, { color: m.from === "hr" ? c.gold : c.brand, fontWeight: "700" }]}>
                    {m.from === "manager" ? managerName || "Manager" : "HR"}
                  </Text>
                ) : null}
                <Text style={[type.body, { color: mine ? "#FFFFFF" : c.text }]}>{m.text}</Text>
                <Text style={[type.small, { color: mine ? "rgba(255,255,255,0.75)" : c.faint, alignSelf: "flex-end" }]}>{clock(m.createdAt)}</Text>
              </View>
            </View>
          );
        }}
      />
      <View style={[styles.compose, { backgroundColor: c.bg, paddingBottom: insets.bottom + space.sm }]}>
        <View style={[styles.inputWrap, { backgroundColor: c.card }, elevation(c)]}>
          <TextInput
            style={[styles.input, { color: c.text }]}
            placeholder={`Message ${readers}`}
            placeholderTextColor={c.faint}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={2000}
            accessibilityLabel="Message"
          />
          <Pressable
            onPress={send}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Send"
            style={({ pressed }) => [styles.send, { backgroundColor: canSend ? c.brand : c.sunk, transform: [{ scale: pressed ? 0.92 : 1 }] }]}
          >
            <Ionicons name="arrow-up" size={20} color={canSend ? "#FFFFFF" : c.faint} />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  list: { padding: space.lg, gap: 6, flexGrow: 1 },
  banner: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.pill, alignSelf: "center" },
  dayRow: { alignItems: "center", marginVertical: space.sm },
  dayPill: { borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 4 },
  row: { flexDirection: "row" },
  rowMine: { justifyContent: "flex-end" },
  bubble: { maxWidth: "80%", borderRadius: 20, paddingVertical: space.sm + 2, paddingHorizontal: space.md + 2, gap: 2 },
  compose: { paddingHorizontal: space.md, paddingTop: space.sm },
  inputWrap: { flexDirection: "row", alignItems: "flex-end", borderRadius: 26, paddingLeft: space.lg, paddingRight: 6, paddingVertical: 6, gap: space.sm },
  input: { flex: 1, maxHeight: 120, fontSize: 16, paddingVertical: 8 },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" }
});
