import { useState } from "react";
import { Alert, Linking, Platform, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { getDocumentLink, getDocuments, getProfileDetails } from "../../api/me";
import { API_URL, DEMO } from "../../api/client";
import { useAuth, useFeatures } from "../../auth/AuthContext";
import { Card, ListRow, Pill, Progress, Screen, Section, showDate } from "../../ui/components";
import { useLoad } from "../../ui/useLoad";
import { radius, space, type, useTheme } from "../../ui/theme";

const initials = (name) =>
  String(name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
const titleCase = (s) => String(s || "").toLowerCase().replace(/(^|\s)\S/g, (ch) => ch.toUpperCase());
// Which over-the-air update this phone is running, so HR can check an update
// arrived: "Update 24 Nov 16:40 · 01a20d33" or "Update: none yet (APK code)".
const two = (n) => String(n).padStart(2, "0");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function updateLine() {
  if (!Updates.isEnabled) return "";
  if (Updates.isEmbeddedLaunch || !Updates.updateId) return "Update: none yet (APK code)";
  const at = Updates.createdAt;
  const when = at ? `${at.getDate()} ${MONTHS[at.getMonth()]} ${two(at.getHours())}:${two(at.getMinutes())}` : "";
  return ["Update", when, "·", Updates.updateId.slice(0, 8)].filter(Boolean).join(" ");
}

// More > Check for updates: fetch the newest update now and restart into it.
// When nothing new arrives, show the updater's recent errors so HR can tell
// why (no internet, a crashed update rolled back, ...).
async function checkForUpdates(setChecking) {
  if (!Updates.isEnabled) return say("Updates", "Updates work in the installed app only.");
  setChecking(true);
  try {
    const check = await Updates.checkForUpdateAsync();
    if (check.isAvailable) {
      const got = await Updates.fetchUpdateAsync();
      if (got.isNew || got.isRollBackToEmbedded) {
        say("Update downloaded", "The app will restart now with the new version.");
        await Updates.reloadAsync();
        return;
      }
    }
    const errors = (await Updates.readLogEntriesAsync(24 * 60 * 60 * 1000))
      .filter((e) => e.level === "error" || e.level === "fatal")
      .slice(-3)
      .map((e) => `• ${e.message}`)
      .join("\n");
    say("No new update", `You have the latest version.\n${updateLine()}${errors ? `\n\nRecent update errors:\n${errors}` : ""}`);
  } catch (err) {
    say("Update failed", err.message || String(err));
  } finally {
    setChecking(false);
  }
}

const say = (title, message) => (Platform.OS === "web" ? window.alert(`${title}\n\n${message}`) : Alert.alert(title, message));

// Me: who I am, how complete my profile is, my work details, help, my
// documents, and log out -- grouped lists like a phone's own settings.
export default function Me() {
  const c = useTheme();
  const { employee, signOut } = useAuth();
  const f = useFeatures(); // what HR lets the app show
  const [checking, setChecking] = useState(false);
  const { data: docs, loading, reload } = useLoad(() => (f.documents ? getDocuments() : Promise.resolve([])), [f.documents]);
  const { data: details, reload: reloadDetails } = useLoad(() => getProfileDetails().catch(() => null), []);
  const missing = details ? details.missingFields.length + details.missingDocuments.length : 0;
  const required = details?.required || 0;
  const complete = required ? Math.max(0, (required - missing) / required) : 0;

  async function open(doc) {
    try {
      const { url } = await getDocumentLink(doc.id);
      await Linking.openURL(url);
    } catch (err) {
      say("Couldn't open", err.message);
    }
  }

  async function logOut() {
    const ok =
      Platform.OS === "web"
        ? window.confirm("Log out of HRDK?")
        : await new Promise((resolve) =>
            Alert.alert("Log out of HRDK?", "You can log in again with your Employee ID.", [
              { text: "Stay", style: "cancel", onPress: () => resolve(false) },
              { text: "Log out", style: "destructive", onPress: () => resolve(true) }
            ])
          );
    if (ok) signOut();
  }

  return (
    <Screen
      safeTop
      title="Me"
      refreshing={loading}
      onRefresh={() => {
        reload();
        reloadDetails();
      }}
    >
      <Card>
        <View style={styles.who}>
          <View style={[styles.avatar, { backgroundColor: c.brand }]}>
            <Text style={[type.title, { color: "#FFFFFF" }]}>{initials(employee?.name)}</Text>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[type.title, { color: c.text }]}>{titleCase(employee?.name)}</Text>
            <Text style={[type.label, { color: c.muted }]}>{titleCase(employee?.designation) || "Employee"}</Text>
            <View style={styles.chips}>
              <Pill text={`ID ${employee?.employeeId}`} tone="brand" />
              {employee?.code ? <Pill text={employee.code} tone="muted" /> : null}
            </View>
          </View>
        </View>

        {details ? (
          <View style={[styles.complete, { backgroundColor: missing ? c.badSoft : c.goodSoft }]}>
            <View style={styles.completeHead}>
              <Text style={[type.label, { color: missing ? c.bad : c.good, fontWeight: "700" }]}>
                {missing ? `Profile ${Math.round(complete * 100)}% complete` : "Profile complete"}
              </Text>
              <Text style={[type.small, { color: missing ? c.bad : c.good }]}>{missing ? `${missing} to add` : "Thank you"}</Text>
            </View>
            <Progress share={complete} tone={missing ? "bad" : "good"} />
          </View>
        ) : null}
      </Card>

      <Card padded={false}>
        <ListRow
          icon="person-outline"
          label="My profile"
          note="Personal details, address, bank and documents"
          onPress={() => router.push("/profile")}
          right={missing ? <Pill text={`${missing} missing`} tone="bad" /> : null}
          last={!f.chat}
        />
        {f.chat ? (
          <ListRow
            icon="chatbubble-ellipses-outline"
            label="Chat with my manager and HR"
            note="Only your manager and HR can read it"
            onPress={() => router.push("/chat")}
            last
          />
        ) : null}
      </Card>

      <Section title="Work">
        <Card padded={false}>
          <ListRow icon="business-outline" label="Department" value={titleCase(employee?.department) || "–"} />
          <ListRow icon="git-branch-outline" label="Section" value={titleCase(employee?.section) || "–"} />
          <ListRow icon="people-outline" label="Manager" value={titleCase(employee?.reportingManager) || "–"} />
          <ListRow icon="calendar-outline" label="Joined" value={employee?.joiningDate || "–"} last />
        </Card>
      </Section>

      {docs?.length ? (
        <Section title="Letters and documents">
          <Card padded={false}>
            {docs.map((d, i) => (
              <ListRow
                key={d.id}
                icon={d.category === "Letters" ? "mail-outline" : "document-text-outline"}
                label={d.name}
                note={d.uploadedAt ? `Added ${showDate(String(d.uploadedAt).slice(0, 10))}` : undefined}
                onPress={() => open(d)}
                last={i === docs.length - 1}
              />
            ))}
          </Card>
        </Section>
      ) : null}

      <Card padded={false}>
        {Updates.isEnabled ? (
          <ListRow
            icon="cloud-download-outline"
            label={checking ? "Checking for updates…" : "Check for updates"}
            note={updateLine()}
            onPress={checking ? undefined : () => checkForUpdates(setChecking)}
          />
        ) : null}
        <ListRow icon="log-out-outline" label="Log out" danger onPress={logOut} last />
      </Card>

      <Text style={[type.small, { color: c.faint, textAlign: "center" }]}>
        HRDK Jewel Craft · v{Constants.expoConfig?.version}
        {DEMO ? " · sample data" : `\n${API_URL.replace(/^https?:\/\//, "")}`}
        {updateLine() ? `\n${updateLine()}` : ""}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  who: { flexDirection: "row", alignItems: "center", gap: space.lg },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  chips: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  complete: { borderRadius: radius.inner, padding: space.md, gap: space.sm },
  completeHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }
});
