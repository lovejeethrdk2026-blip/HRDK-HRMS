import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { NavigationBar } from "expo-navigation-bar";
import { Platform, useColorScheme } from "react-native";
import { AuthProvider } from "../auth/AuthContext";
import { useTheme } from "../ui/theme";

// Root of the app: login state for every screen, and the screen stack
// (Login, the tab screens, and pages opened on top of them).
export default function RootLayout() {
  const c = useTheme();
  const dark = useColorScheme() === "dark";
  return (
    <AuthProvider>
      <StatusBar style={dark ? "light" : "dark"} />
      {/* Android back / home / recent buttons: dark on the white tab bar, light in dark mode. */}
      {Platform.OS === "android" ? <NavigationBar style={dark ? "light" : "dark"} /> : null}
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.card },
          headerTintColor: c.text,
          headerTitleStyle: { fontWeight: "600" },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: c.bg }
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="apply-leave" options={{ title: "Apply leave", presentation: "modal" }} />
        <Stack.Screen name="payslip/[month]" options={{ title: "Payslip" }} />
        <Stack.Screen name="profile" options={{ title: "My profile" }} />
        <Stack.Screen name="chat" options={{ title: "Chat" }} />
      </Stack>
    </AuthProvider>
  );
}
