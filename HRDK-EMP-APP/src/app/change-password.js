import { useState } from "react";
import { Text } from "react-native";
import { Redirect, router, Stack } from "expo-router";
import { changePassword } from "../api/me";
import { useAuth } from "../auth/AuthContext";
import { Button, Card, ErrorText, Field, Screen } from "../ui/components";
import { type, useTheme } from "../ui/theme";

// Change my app password. After logging in with the password HR gave
// (employee.mustChangePassword) the app opens this first and the employee
// can't go on without choosing their own. Also reachable from Me.
// Server: portal/appPasswords.js (POST /api/me/password).
export default function ChangePassword() {
  const c = useTheme();
  const { employee, refresh, signOut } = useAuth();
  const forced = Boolean(employee?.mustChangePassword);
  const needsCurrent = Boolean(employee?.hasPassword);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!employee) return <Redirect href="/login" />;

  async function save() {
    if (needsCurrent && !current) return setError(forced ? "Enter the password HR gave you" : "Enter your current password");
    if (next.length < 6) return setError("New password must be at least 6 characters");
    if (next !== again) return setError("The two new passwords are not the same");
    setSaving(true);
    setError("");
    try {
      await changePassword(current, next);
      await refresh();
      router.replace("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <Stack.Screen
        options={{ title: forced ? "Choose your password" : "Change password", headerBackVisible: !forced, gestureEnabled: !forced }}
      />
      <Card>
        <Text style={[type.body, { color: c.muted }]}>
          {forced
            ? "You logged in with the password HR gave you. Choose your own password now; from next time log in with it."
            : needsCurrent
              ? "Enter your current password, then your new one."
              : "Set a password for the app. From next time log in with your Employee ID and this password."}
        </Text>
        {needsCurrent ? (
          <Field
            label={forced ? "Password from HR" : "Current password"}
            value={current}
            onChangeText={setCurrent}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
        ) : null}
        <Field
          label="New password"
          hint="At least 6 characters"
          value={next}
          onChangeText={setNext}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Field label="New password again" value={again} onChangeText={setAgain} secureTextEntry autoCapitalize="none" autoCorrect={false} />
        <ErrorText error={error} />
        <Button title="Save password" icon="lock-closed" onPress={save} loading={saving} />
        {forced ? <Button title="Log out" kind="secondary" onPress={signOut} /> : null}
      </Card>
    </Screen>
  );
}
