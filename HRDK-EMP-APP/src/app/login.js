import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { Redirect } from "expo-router";
import { DEMO } from "../api/client";
import { sendOtp } from "../api/me";
import { useAuth } from "../auth/AuthContext";
import { Button, ErrorText, Loading } from "../ui/components";
import { useTheme } from "../ui/theme";

// Login in two steps: Employee ID, then the OTP the server sends to the
// mobile number HR has on record (never a number typed here).
export default function Login() {
  const c = useTheme();
  const { employee, checking, signIn } = useAuth();
  const [step, setStep] = useState("id");
  const [employeeId, setEmployeeId] = useState("");
  const [otp, setOtp] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (checking) return <Loading />;
  if (employee) return <Redirect href="/" />;

  async function requestOtp() {
    const id = employeeId.trim();
    if (!id) return setError("Enter your Employee ID");
    setBusy(true);
    setError("");
    try {
      const data = await sendOtp(id);
      setSentTo(data.sentTo || "");
      setOtp("");
      setStep("otp");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (otp.length !== 6) return setError("Enter the 6-digit OTP");
    setBusy(true);
    setError("");
    try {
      await signIn(employeeId.trim(), otp);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const input = [styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.card }];

  return (
    <KeyboardAvoidingView style={[styles.page, { backgroundColor: c.bg }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.box}>
        <View style={[styles.logo, { backgroundColor: c.brand }]}>
          <Text style={styles.logoText}>HRDK</Text>
        </View>
        <Text style={[styles.title, { color: c.text }]}>Employee login</Text>
        <Text style={[styles.sub, { color: c.muted }]}>
          {step === "id" ? "Enter your Employee ID. We'll send an OTP to your registered mobile." : `OTP sent to ${sentTo || "your registered mobile"}.`}
        </Text>

        {step === "id" ? (
          <TextInput
            style={input}
            placeholder="Employee ID, e.g. 10395"
            placeholderTextColor={c.muted}
            value={employeeId}
            onChangeText={setEmployeeId}
            keyboardType="number-pad"
            autoFocus
            returnKeyType="next"
            onSubmitEditing={requestOtp}
          />
        ) : (
          <TextInput
            style={[input, styles.otp]}
            placeholder="••••••"
            placeholderTextColor={c.muted}
            value={otp}
            onChangeText={(t) => setOtp(t.replace(/\D/g, "").slice(0, 6))}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            autoFocus
            maxLength={6}
            onSubmitEditing={confirm}
          />
        )}

        <ErrorText error={error} />

        {step === "id" ? (
          <Button title="Send OTP" onPress={requestOtp} loading={busy} />
        ) : (
          <>
            <Button title="Log in" onPress={confirm} loading={busy} />
            <Button title="Change Employee ID" kind="secondary" onPress={() => setStep("id")} disabled={busy} />
          </>
        )}

        {DEMO && <Text style={[styles.demo, { color: c.warn, backgroundColor: c.warnSoft }]}>Demo mode: any ID, OTP 123456</Text>}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: "center" },
  box: { padding: 24, gap: 14 },
  logo: { width: 64, height: 64, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  logoText: { color: "#fff", fontWeight: "800", fontSize: 16, letterSpacing: 1 },
  title: { fontSize: 26, fontWeight: "700" },
  sub: { fontSize: 15, lineHeight: 21 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, fontSize: 17 },
  otp: { letterSpacing: 10, textAlign: "center", fontSize: 24 },
  demo: { textAlign: "center", padding: 8, borderRadius: 8, fontSize: 13 }
});
