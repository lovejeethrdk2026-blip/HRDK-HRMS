import { useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { Ionicons } from "@expo/vector-icons";
import { correctProfile, getProfileDetails, uploadMyDocument } from "../api/me";
import { useFeatures } from "../auth/AuthContext";
import { Button, Card, ErrorText, Field, IconCircle, LoadingCards, Pill, Progress, Screen, Section, showDate, tap } from "../ui/components";
import { useLoad } from "../ui/useLoad";
import { radius, space, type, useTheme } from "../ui/theme";

// My profile: everything HR has on the employee, as on the Add Employee form,
// with what is missing marked. The employee can correct their own personal,
// contact, address and bank details ONCE (after that, only HR), and upload
// each missing document once. Server: portal/profile.js.

// Alert with OK/Cancel that also works in the web preview.
function confirmBox(title, message, okLabel = "Save") {
  if (Platform.OS === "web") return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: okLabel, onPress: () => resolve(true) }
    ])
  );
}
const notify = (title, message) => (Platform.OS === "web" ? window.alert(`${title}\n\n${message}`) : Alert.alert(title, message));

const SECTION_ICON = {
  Employee: "briefcase-outline",
  Personal: "person-outline",
  "Emergency contact": "call-outline",
  "Current address": "home-outline",
  "Permanent address": "location-outline",
  Bank: "card-outline"
};

export default function Profile() {
  const c = useTheme();
  const { profileEdit } = useFeatures(); // HR can switch fixing details off
  const { data, error, loading, reload } = useLoad(getProfileDetails, []);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [uploading, setUploading] = useState("");

  if (!data) {
    return (
      <Screen onRefresh={reload} refreshing={loading}>
        <ErrorText error={error} />
        {loading ? <LoadingCards count={3} /> : null}
      </Screen>
    );
  }

  const editable = data.sections.flatMap((s) => s.fields).filter((f) => f.editable);
  const canCorrect = profileEdit && !data.correction.used && editable.length > 0;
  const missingCount = data.missingFields.length + data.missingDocuments.length;
  const complete = data.required ? (data.required - missingCount) / data.required : 0;

  function startEditing() {
    tap();
    setValues(Object.fromEntries(editable.map((f) => [f.path, f.value])));
    setSaveError("");
    setEditing(true);
  }

  async function save() {
    const changed = Object.fromEntries(
      editable.filter((f) => (values[f.path] ?? "") !== f.value).map((f) => [f.path, values[f.path] ?? ""])
    );
    if (!Object.keys(changed).length) return setSaveError("You haven't changed anything yet.");
    const ok = await confirmBox(
      "Save your details?",
      "You can correct your details only ONCE from the app. After this, only HR can change them. Check everything first."
    );
    if (!ok) return;
    setSaving(true);
    setSaveError("");
    try {
      await correctProfile(changed);
      setEditing(false);
      await reload();
      notify("Saved", "Your details are updated. HR can see what you changed.");
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // One upload per document: confirm first, as it can't be changed after.
  async function upload(title) {
    const sure = await confirmBox(
      `Upload ${title}?`,
      "You can upload each document only ONCE. After that you can't change or delete it from the app; only HR can. Pick the right, clear file.",
      "Choose file"
    );
    if (!sure) return;
    const picked = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/jpeg", "image/png"],
      copyToCacheDirectory: true,
      multiple: false
    });
    if (picked.canceled || !picked.assets?.length) return;
    const asset = picked.assets[0];
    if (asset.size && asset.size > 10 * 1024 * 1024) return notify("Too big", "The file must be 10 MB or less.");
    setUploading(title);
    try {
      await uploadMyDocument(title, asset);
      tap();
      await reload();
    } catch (err) {
      notify("Upload failed", err.message);
    } finally {
      setUploading("");
    }
  }

  const footer = editing ? (
    <View style={{ gap: space.sm }}>
      <ErrorText error={saveError} />
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Button title="Cancel" kind="secondary" onPress={() => setEditing(false)} disabled={saving} style={{ flex: 1 }} />
        <Button title="Save details" icon="checkmark" onPress={save} loading={saving} style={{ flex: 2 }} />
      </View>
    </View>
  ) : null;

  return (
    <Screen refreshing={loading} onRefresh={reload} footer={footer}>
      <ErrorText error={error} />

      <Card>
        <View style={styles.statusHead}>
          <IconCircle name={missingCount ? "alert-circle" : "checkmark-circle"} tone={missingCount ? "bad" : "good"} size={44} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[type.heading, { color: c.text }]}>{missingCount ? `${Math.round(complete * 100)}% complete` : "Profile complete"}</Text>
            <Text style={[type.small, { color: c.muted }]}>
              {missingCount ? `${missingCount} thing${missingCount > 1 ? "s" : ""} still needed by HR` : "HR has everything it needs."}
            </Text>
          </View>
        </View>
        <Progress share={complete} tone={missingCount ? "bad" : "good"} height={8} />
        {missingCount ? (
          <View style={styles.chips}>
            {[...data.missingFields.map((f) => f.split(": ").reverse().join(", ")), ...data.missingDocuments].map((item) => (
              <View key={item} style={[styles.chip, { backgroundColor: c.badSoft }]}>
                <Text style={[type.small, { color: c.bad, fontWeight: "600" }]}>{item}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </Card>

      {canCorrect && !editing ? (
        <Card tone="brand">
          <View style={styles.statusHead}>
            <Ionicons name="create-outline" size={22} color={c.brandInk} />
            <Text style={[type.label, { color: c.brandInk, flex: 1 }]}>
              Something wrong or missing? You can fill and correct your own details once from the app.
            </Text>
          </View>
          <Button title="Fill or correct my details" onPress={startEditing} />
        </Card>
      ) : data.correction.used ? (
        <Text style={[type.small, { color: c.faint, textAlign: "center" }]}>
          You corrected your details on {showDate(String(data.correction.at).slice(0, 10))}. For more changes, ask HR.
        </Text>
      ) : null}

      {data.sections.map((section) => (
        <Section key={section.title} title={section.title}>
          <Card padded={!editing || !section.fields.some((f) => f.editable)} style={editing ? { padding: space.lg } : null}>
            {section.fields.map((f, i) =>
              editing && f.editable ? (
                f.options ? (
                  <View key={f.path} style={{ gap: 6 }}>
                    <Text style={[type.label, { color: c.text, fontWeight: "600" }]}>{f.label}</Text>
                    <View style={styles.options}>
                      {f.options.map((option) => {
                        const on = values[f.path] === option;
                        return (
                          <Pressable
                            key={option}
                            onPress={() => {
                              tap();
                              setValues((v) => ({ ...v, [f.path]: on ? "" : option }));
                            }}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: on }}
                            style={[styles.option, { borderColor: on ? c.brand : c.border, backgroundColor: on ? c.brand : c.card }]}
                          >
                            <Text style={[type.label, { color: on ? "#FFFFFF" : c.text, fontWeight: "600" }]}>{option}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ) : (
                  <Field
                    key={f.path}
                    label={f.label}
                    value={values[f.path] ?? ""}
                    onChangeText={(t) => setValues((v) => ({ ...v, [f.path]: f.upper ? t.toUpperCase() : t }))}
                    keyboardType={f.keyboard || "default"}
                    autoCapitalize={f.upper ? "characters" : "words"}
                    multiline={Boolean(f.multiline)}
                    placeholder={f.missing ? "Needed by HR" : f.label}
                    hint={f.missing ? "Needed by HR" : undefined}
                  />
                )
              ) : (
                <View key={f.path} style={[styles.row, i < section.fields.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}>
                  <Text style={[type.body, { color: c.muted, flex: 1 }]}>{f.label}</Text>
                  {f.value ? (
                    <Text style={[type.body, { color: c.text, fontWeight: "600", flexShrink: 1, textAlign: "right" }]}>{f.value}</Text>
                  ) : f.missing ? (
                    <Pill text="Missing" tone="bad" />
                  ) : (
                    <Text style={[type.body, { color: c.faint }]}>–</Text>
                  )}
                </View>
              )
            )}
          </Card>
        </Section>
      ))}

      {data.documents.map((group) => (
        <Section key={group.heading} title={group.heading} note="PDF, JPG or PNG, up to 10 MB. Each document can be uploaded once; to change it later, ask HR.">
          <Card padded={false}>
            {group.items.map((doc, i) => {
              // Uploaded = locked, unless HR unlocked it for one new upload.
              const done = doc.uploaded > 0 && !doc.unlocked;
              const busy = uploading === doc.title;
              return (
                <View key={doc.title} style={[styles.docRow, i < group.items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}>
                  <IconCircle
                    name={done ? "checkmark" : doc.important ? "alert" : "document-outline"}
                    tone={done ? "good" : doc.important ? "bad" : "brand"}
                    size={34}
                  />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[type.body, { color: c.text, fontWeight: doc.important ? "600" : "500" }]}>{doc.title}</Text>
                    <Text style={[type.small, { color: done ? c.good : doc.important ? c.bad : c.faint }]}>
                      {done
                        ? "Uploaded, locked"
                        : doc.unlocked
                          ? "Unlocked by HR: upload the new file"
                          : doc.important
                            ? "Needed by HR"
                            : "Optional"}
                    </Text>
                  </View>
                  {done ? (
                    <Ionicons name="lock-closed" size={16} color={c.faint} />
                  ) : !profileEdit ? (
                    <Text style={[type.small, { color: c.faint }]}>Give to HR</Text>
                  ) : (
                    <Pressable
                      onPress={() => upload(doc.title)}
                      disabled={Boolean(uploading)}
                      accessibilityRole="button"
                      accessibilityLabel={`Upload ${doc.title}`}
                      style={({ pressed }) => [styles.uploadBtn, { backgroundColor: c.brandSoft, opacity: uploading && !busy ? 0.4 : pressed ? 0.7 : 1 }]}
                    >
                      <Ionicons name="cloud-upload-outline" size={16} color={c.brand} />
                      <Text style={[type.label, { color: c.brand, fontWeight: "700" }]}>
                        {busy ? "Uploading" : doc.unlocked ? "Upload again" : "Upload"}
                      </Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </Card>
        </Section>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  statusHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 48, paddingHorizontal: space.lg, marginHorizontal: -space.lg - 2 },
  options: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  option: { borderWidth: 1.5, borderRadius: radius.pill, paddingVertical: 9, paddingHorizontal: space.lg },
  docRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md, paddingHorizontal: space.lg, minHeight: 64 },
  uploadBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.pill, paddingHorizontal: space.md, minHeight: 36 }
});
