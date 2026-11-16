import { StyleSheet, Text, View } from "react-native";
import { radius, space, type, useTheme } from "./theme";

// One day as a timeline: the shift's hours across the strip, blue blocks for
// time inside (ENTRY -> EXIT), and red ticks where a punch is missing. The
// strip spans the shift (default 09:00-19:00), widened to cover every punch.

const toMin = (hhmm) => {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const label = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:00`;

export default function DayStrip({ pairs = [], shift, nowMin }) {
  const c = useTheme();
  const times = pairs.flatMap((p) => [toMin(p.in), toMin(p.out)]).filter((t) => t !== null);
  let start = toMin(shift?.in) ?? 9 * 60;
  let end = toMin(shift?.out) ?? 19 * 60;
  if (end <= start) end += 24 * 60; // night shift
  if (times.length) {
    start = Math.min(start, ...times);
    end = Math.max(end, ...times, nowMin ?? 0);
  }
  start = Math.floor(start / 60) * 60;
  end = Math.ceil(end / 60) * 60;
  const span = Math.max(60, end - start);
  const at = (min) => `${Math.min(100, Math.max(0, ((min - start) / span) * 100))}%`;

  const blocks = [];
  const misses = [];
  pairs.forEach((p, i) => {
    const a = toMin(p.in);
    let b = toMin(p.out);
    const last = i === pairs.length - 1;
    if (a !== null && b === null && last && nowMin != null) b = nowMin; // still inside
    if (a !== null && b !== null) blocks.push({ a, b: b < a ? b + 24 * 60 : b, open: b === nowMin && !p.out });
    if (a === null && b !== null) misses.push(b);
    if (b === null && a !== null && !last) misses.push(a);
  });

  const hours = [];
  for (let h = start; h <= end; h += span > 12 * 60 ? 180 : 120) hours.push(h);

  return (
    <View accessible accessibilityLabel={`Time inside today: ${blocks.length} stretch${blocks.length === 1 ? "" : "es"}`}>
      <View style={[styles.track, { backgroundColor: c.sunk }]}>
        {blocks.map((blk, i) => (
          <View
            key={i}
            style={[
              styles.block,
              {
                left: at(blk.a),
                width: `${Math.max(1.5, ((blk.b - blk.a) / span) * 100)}%`,
                backgroundColor: c.brand,
                opacity: blk.open ? 0.55 : 1
              }
            ]}
          />
        ))}
        {misses.map((m, i) => (
          <View key={`m${i}`} style={[styles.miss, { left: at(m), backgroundColor: c.bad }]} />
        ))}
        {nowMin != null && nowMin >= start && nowMin <= end ? (
          <View style={[styles.now, { left: at(nowMin), backgroundColor: c.text }]} />
        ) : null}
      </View>
      <View style={styles.scale}>
        {hours.map((h, i) => {
          // Edge labels sit inside the strip instead of hanging off it.
          const edge = i === 0 ? styles.tickFirst : i === hours.length - 1 && h >= end ? styles.tickLast : null;
          return (
            <Text key={h} style={[type.small, type.figure, styles.tick, edge, { left: at(h), color: c.faint }]}>
              {label(h)}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 22, borderRadius: radius.pill, overflow: "hidden", position: "relative" },
  block: { position: "absolute", top: 3, bottom: 3, borderRadius: radius.pill },
  miss: { position: "absolute", top: 0, bottom: 0, width: 3, marginLeft: -1.5 },
  now: { position: "absolute", top: -2, bottom: -2, width: 2, marginLeft: -1 },
  scale: { height: 18, marginTop: space.xs, position: "relative" },
  tick: { position: "absolute", width: 40, marginLeft: -20, textAlign: "center" },
  tickFirst: { marginLeft: 0, textAlign: "left" },
  tickLast: { marginLeft: -40, textAlign: "right" }
});
