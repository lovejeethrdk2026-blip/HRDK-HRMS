import { useState } from "react";
import { Alert, Image, Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getDocumentLink } from "../api/me";
import { API_URL } from "../api/client";
import { space, type } from "./theme";

// Opening one of my documents: an image shows full screen here (the cross or
// Back closes it); a PDF / Excel opens in the phone's browser. Both through a
// signed 10-minute link from the server.
//   const { openDocument, viewer } = useDocumentView();
//   openDocument({ id, mimeType, name });   ...   {viewer}  (once, in the screen)
export function useDocumentView() {
  const [viewing, setViewing] = useState(null); // { uri, name }

  async function openDocument({ id, mimeType, name }) {
    try {
      const { path } = await getDocumentLink(id);
      const uri = `${API_URL}${path}`;
      if (/^image\//.test(mimeType || "")) setViewing({ uri, name });
      else await Linking.openURL(uri);
    } catch (err) {
      const message = err.message || String(err);
      if (Platform.OS === "web") window.alert(`Couldn't open\n\n${message}`);
      else Alert.alert("Couldn't open", message);
    }
  }

  const viewer = (
    <Modal visible={Boolean(viewing)} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
      <View style={styles.viewer}>
        <View style={styles.bar}>
          <Text style={[type.heading, { color: "#FFFFFF", flex: 1 }]} numberOfLines={1}>
            {viewing?.name}
          </Text>
          <Pressable
            onPress={() => setViewing(null)}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={12}
            style={({ pressed }) => [styles.close, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </Pressable>
        </View>
        {viewing ? <Image source={{ uri: viewing.uri }} style={styles.image} resizeMode="contain" /> : null}
      </View>
    </Modal>
  );

  return { openDocument, viewer };
}

const styles = StyleSheet.create({
  viewer: { flex: 1, backgroundColor: "rgba(0,0,0,0.94)" },
  bar: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingTop: 48, paddingBottom: space.md },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.16)" },
  image: { flex: 1, width: "100%", marginBottom: space.lg }
});
