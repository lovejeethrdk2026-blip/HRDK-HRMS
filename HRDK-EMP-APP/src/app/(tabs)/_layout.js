import { Pressable, StyleSheet, View } from "react-native";
import { Redirect, Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../auth/AuthContext";
import { Loading } from "../../ui/components";
import { useTheme } from "../../ui/theme";

// The bottom tab bar: rounded, with a soft shadow. Its height is the bar
// itself plus the phone's own button / gesture bar (safe area inset), so it
// never sits under Android's back / home buttons; screens end above it.
// Attendance sits in the middle as a raised round button. Each tab draws its
// own large title, so no header bar.
const TABS = [
  ["index", "Home", "home"],
  ["leave", "Leave", "airplane"],
  ["attendance", "Attendance", "calendar", true],
  ["payslip", "Salary", "wallet"],
  ["more", "Me", "person-circle"]
];

function CentreButton({ onPress, accessibilityState }) {
  const c = useTheme();
  const on = accessibilityState?.selected;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Attendance" style={styles.centreWrap}>
      <View style={[styles.centre, { backgroundColor: c.brand, borderColor: c.bg, opacity: on ? 1 : 0.92 }]}>
        <Ionicons name="calendar" size={26} color="#FFFFFF" />
      </View>
    </Pressable>
  );
}

export default function TabsLayout() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { employee, checking } = useAuth();
  if (checking) return <Loading />;
  if (!employee) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.brand,
        tabBarInactiveTintColor: c.faint,
        tabBarStyle: {
          backgroundColor: c.card,
          borderTopWidth: 0,
          height: 70 + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom + 8,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          shadowColor: "#0F2B3D",
          shadowOpacity: 0.08,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: -4 },
          elevation: 12
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        sceneStyle: { backgroundColor: c.bg }
      }}
    >
      {TABS.map(([name, title, icon, centre]) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            ...(centre
              ? { tabBarLabel: () => null, tabBarButton: (props) => <CentreButton {...props} /> }
              : {
                  tabBarIcon: ({ color, size, focused }) => (
                    <Ionicons name={focused ? icon : `${icon}-outline`} color={color} size={size} />
                  )
                })
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  centreWrap: { flex: 1, alignItems: "center" },
  centre: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 5,
    marginTop: -26,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0F2B3D",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8
  }
});
