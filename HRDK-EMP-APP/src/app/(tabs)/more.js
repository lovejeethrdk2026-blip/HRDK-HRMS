import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { getDocumentLink, getDocuments } from "../../api/me";
import { API_URL, DEMO } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { Button, Card, ErrorText, Row, Screen, showDate } from "../../ui/components";
import { useLoad } from "../../ui/useLoad";
import { useTheme } from "../../ui/theme";
import Constants from "expo-constants";

// More: my documents (offer letter, appointment, increments...), my details
// and log out.
export default function More() {
  const c = useTheme();
  const { employee, signOut } = useAuth();
  const { data: docs, error, loading, reload } = useLoad(getDocuments, []);

  async function open(doc) {
    try {
      const { url } = await getDocumentLink(doc.id);
      await Linking.openURL(url);
    } catch (err) {
      Alert.alert("Couldn't open", err.message);
    }
  }

  function askLogout() {
    Alert.alert("Log out?", "You'll need an OTP to log in again.", [
      { text: "Stay", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: signOut }
    ]);
  }

  const groups = {};
  for (const d of docs || []) (groups[d.category || "Documents"] ??= []).push(d);

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <ErrorText error={error} />

      {Object.entries(groups).map(([category, list]) => (
        <Card key={category} title={category}>
          {list.map((d) => (
            <Pressable key={d.id} onPress={() => open(d)} style={({ pressed }) => [styles.doc, { borderTopColor: c.border, opacity: pressed ? 0.6 : 1 }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontSize: 15, fontWeight: "600" }}>{d.name}</Text>
                {d.uploadedAt ? <Text style={{ color: c.muted, fontSize: 13 }}>{showDate(d.uploadedAt.slice(0, 10))}</Text> : null}
              </View>
              <Text style={{ color: c.brand, fontWeight: "600" }}>Open ›</Text>
            </Pressable>
          ))}
        </Card>
      ))}
      {!loading && !docs?.length && (
        <Card title="Documents">
          <Text style={{ color: c.muted }}>No documents shared with you yet.</Text>
        </Card>
      )}

      <Card title="My details">
        <Row label="Employee ID" value={employee?.employeeId} />
        <Row label="Name" value={employee?.name} />
        <Row label="Department" value={employee?.department || "–"} />
        {employee?.designation ? <Row label="Designation" value={employee.designation} /> : null}
        {employee?.joiningDate ? <Row label="Joined" value={employee.joiningDate} /> : null}
        {employee?.reportingManager ? <Row label="Manager" value={employee.reportingManager} /> : null}
        <Row label="Mobile" value={employee?.mobile || "–"} />
        <Text style={{ color: c.muted, fontSize: 13 }}>Something wrong? Tell HR to correct it.</Text>
      </Card>

      <Button title="Log out" kind="danger" onPress={askLogout} />
      <Text style={[styles.version, { color: c.muted }]}>
        HRDK v{Constants.expoConfig?.version} {DEMO ? "· demo data" : `· ${API_URL.replace(/^https?:\/\//, "")}`}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  doc: { flexDirection: "row", alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 12 },
  version: { textAlign: "center", fontSize: 12 }
});
