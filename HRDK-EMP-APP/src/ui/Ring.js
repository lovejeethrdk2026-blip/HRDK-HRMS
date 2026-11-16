import { Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { type, useTheme } from "./theme";

// A progress ring: share 0..1 of the circle filled, a figure in the middle and
// a small word under it.
export default function Ring({ share = 0, size = 92, stroke = 10, value, unit, color, track }) {
  const c = useTheme();
  const r = (size - stroke) / 2;
  const length = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(1, share)) * length;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track || c.card} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color || c.brand}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${length}`}
        />
      </Svg>
      <Text style={[type.title, type.figure, { color: c.text }]}>{value}</Text>
      {unit ? <Text style={[type.small, { color: c.muted, marginTop: -2 }]}>{unit}</Text> : null}
    </View>
  );
}
