import { useColorScheme } from "react-native";

// Colours for light and dark phones. Teal is the HRDK brand colour.
const light = {
  brand: "#0F6E56",
  brandSoft: "#E1F5EE",
  bg: "#F4F3EF",
  card: "#FFFFFF",
  text: "#1F1F1D",
  muted: "#6B6A65",
  border: "#E2E0D8",
  good: "#3B6D11",
  goodSoft: "#EAF3DE",
  warn: "#854F0B",
  warnSoft: "#FAEEDA",
  bad: "#A32D2D",
  badSoft: "#FCEBEB",
  info: "#185FA5",
  infoSoft: "#E6F1FB"
};

const dark = {
  brand: "#5DCAA5",
  brandSoft: "#08332A",
  bg: "#121211",
  card: "#1D1D1B",
  text: "#F1EFE8",
  muted: "#A3A199",
  border: "#2E2E2B",
  good: "#97C459",
  goodSoft: "#1E2E10",
  warn: "#EF9F27",
  warnSoft: "#332308",
  bad: "#F09595",
  badSoft: "#3A1515",
  info: "#85B7EB",
  infoSoft: "#0F2740"
};

export function useTheme() {
  return useColorScheme() === "dark" ? dark : light;
}
