import { Platform, useColorScheme } from "react-native";

// HRDK design tokens. The brand is the admin site's green (was the logo blue
// until 2026-11-24). From the HRDK logo:
// its red is kept for problems only (absent, missed, missing), and a jeweller's
// gold marks money. Every screen takes colours, sizes and spacing from here.

const light = {
  brand: "#235347", // HRDK green, same as the admin site (--green-700)
  brandSoft: "#DAF1DE",
  brandInk: "#0B2B26",
  bg: "#F2F5F8",
  card: "#FFFFFF",
  sunk: "#EEF2F6", // inset areas inside a card
  text: "#14212C",
  muted: "#5D6B78",
  faint: "#8D98A4",
  border: "#E1E7ED",
  good: "#2C7A4D",
  goodSoft: "#E3F2E9",
  warn: "#9A6200",
  warnSoft: "#FBF0DC",
  bad: "#D7262E", // HRDK red
  badSoft: "#FCE8E9",
  info: "#1F6E9C",
  infoSoft: "#E4EFF6",
  gold: "#A9772A",
  goldSoft: "#F7EEDD",
  shadow: "#0F2B3D",
  dark: false
};

const dark = {
  brand: "#8EB69B", // HRDK green for dark mode (admin --green-300)
  brandSoft: "#163832",
  brandInk: "#DAF1DE",
  bg: "#0D151C",
  card: "#15202A",
  sunk: "#1B2834",
  text: "#E9EFF4",
  muted: "#9BA9B6",
  faint: "#6F7D8A",
  border: "#24323E",
  good: "#6CC492",
  goodSoft: "#173325",
  warn: "#E8B04B",
  warnSoft: "#3A2C0F",
  bad: "#F06A70",
  badSoft: "#3D1719",
  info: "#6FB3DC",
  infoSoft: "#13324A",
  gold: "#D9AE5F",
  goldSoft: "#3A2E17",
  shadow: "#000000",
  dark: true
};

export function useTheme() {
  return useColorScheme() === "dark" ? dark : light;
}

// Spacing steps (4-point grid).
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

// Corner radius by role: the bigger the surface, the rounder.
export const radius = { hero: 26, card: 20, inner: 14, control: 14, pill: 999 };

// Smallest comfortable touch target.
export const TOUCH = 44;

// Type scale. Figures use equal-width digits so times and amounts line up.
export const type = {
  hero: { fontSize: 34, lineHeight: 40, fontWeight: "700", letterSpacing: -0.6 },
  display: { fontSize: 28, lineHeight: 34, fontWeight: "700", letterSpacing: -0.4 },
  title: { fontSize: 20, lineHeight: 26, fontWeight: "700", letterSpacing: -0.2 },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: "600" },
  body: { fontSize: 15, lineHeight: 21, fontWeight: "400" },
  label: { fontSize: 13, lineHeight: 18, fontWeight: "500" },
  small: { fontSize: 12, lineHeight: 16, fontWeight: "400" },
  figure: { fontVariant: ["tabular-nums"] }
};

// Soft lift for cards on the light theme; dark theme uses a hairline instead.
export function elevation(c, level = 1) {
  if (c.dark) return { borderWidth: 1, borderColor: c.border };
  const y = level === 2 ? 8 : 3;
  return Platform.select({
    android: { elevation: level === 2 ? 6 : 2, shadowColor: c.shadow },
    default: { shadowColor: c.shadow, shadowOpacity: level === 2 ? 0.1 : 0.06, shadowRadius: level === 2 ? 18 : 10, shadowOffset: { width: 0, height: y } }
  });
}
