import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "../auth/AuthContext";
import { useTheme } from "../ui/theme";

// Root of the app: login state for every screen, and the screen stack
// (Login, the tab screens, and pages opened on top of them).
export default function RootLayout() {
  const c = useTheme();
  return (
    <AuthProvider>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.card },
          headerTintColor: c.text,
          headerTitleStyle: { fontWeight: "600" },
          contentStyle: { backgroundColor: c.bg }
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="apply-leave" options={{ title: "Apply leave", presentation: "modal" }} />
        <Stack.Screen name="payslip/[month]" options={{ title: "Payslip" }} />
      </Stack>
    </AuthProvider>
  );
}
