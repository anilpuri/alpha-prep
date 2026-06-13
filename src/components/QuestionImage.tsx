import React, { useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import { useTheme } from "../lib/theme-context";

const BROWSER_UA =
  "Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

export function QuestionImage({ uri }: { uri: string }) {
  const { theme }                 = useTheme();
  const [status, setStatus]       = useState<"loading" | "ok" | "error">("loading");
  const [imgHeight, setImgHeight] = useState(220);

  return (
    <View style={[s.wrap, { backgroundColor: theme.bg2, borderColor: theme.border }]}>
      {/*
        Always render the Image so expo-image actually fetches it.
        While loading: position:absolute + opacity:0 + tiny size so it doesn't affect layout
        but still gets fetched (height:0 causes expo-image to skip the fetch entirely).
      */}
      <Image
        source={{ uri, headers: { "User-Agent": BROWSER_UA } }}
        style={
          status === "ok"
            ? [s.img, { height: imgHeight }]
            : { position: "absolute", width: 4, height: 4, opacity: 0 }
        }
        contentFit="contain"
        transition={300}
        onLoad={e => {
          const { width, height } = e.source;
          if (width && height) {
            setImgHeight(Math.min(280, Math.round((height / Math.max(width, 1)) * 320)));
          }
          setStatus("ok");
        }}
        onError={() => setStatus("error")}
      />

      {status === "loading" && (
        <View style={s.placeholder}>
          <ActivityIndicator color="#8880D5" />
          <Text style={[s.placeholderText, { color: theme.muted }]}>Loading image…</Text>
        </View>
      )}

      {status === "error" && (
        <TouchableOpacity style={s.errorBox} onPress={() => Linking.openURL(uri)}>
          <Text style={{ fontSize: 32 }}>📊</Text>
          <Text style={[s.errorLabel, { color: theme.sub }]}>Chart / Diagram</Text>
          <Text style={[s.errorHint, { color: theme.primary }]}>Tap to open in browser ↗</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap:            { borderRadius: 12, borderWidth: 1, overflow: "hidden", marginVertical: 8 },
  img:             { width: "100%" },
  placeholder:     { height: 80, alignItems: "center", justifyContent: "center", gap: 6 },
  placeholderText: { fontSize: 12 },
  errorBox:        { padding: 20, alignItems: "center", gap: 6 },
  errorLabel:      { fontSize: 13, fontWeight: "700" },
  errorHint:       { fontSize: 12, textDecorationLine: "underline" },
});
