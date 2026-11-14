import { Redirect, Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../auth/AuthContext";
import { Loading } from "../../ui/components";
import { useTheme } from "../../ui/theme";

// The bottom tab bar. Only for a logged-in employee; anyone else goes to Login.
const TABS = [
  ["index", "Home", "home-outline"],
  ["attendance", "Attendance", "calendar-outline"],
  ["leave", "Leave", "airplane-outline"],
  ["payslip", "Payslip", "wallet-outline"],
  ["more", "More", "person-circle-outline"]
];

export default function TabsLayout() {
  const c = useTheme();
  const { employee, checking } = useAuth();
  if (checking) return <Loading />;
  if (!employee) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: c.brand,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border },
        headerStyle: { backgroundColor: c.card },
        headerTintColor: c.text,
        headerTitleStyle: { fontWeight: "600" }
      }}
    >
      {TABS.map(([name, title, icon]) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarIcon: ({ color, size }) => <Ionicons name={icon} color={color} size={size} />
          }}
        />
      ))}
    </Tabs>
  );
}
