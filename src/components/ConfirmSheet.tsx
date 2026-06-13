import React, { useEffect, useRef } from "react";
import {
  Modal, View, Text, TouchableOpacity,
  Animated, Dimensions, StyleSheet,
} from "react-native";
import { useTheme } from "../lib/theme-context";

interface Props {
  visible:      boolean;
  icon?:        string;
  title:        string;
  message?:     string;
  confirmLabel?: string;
  cancelLabel?:  string;
  danger?:      boolean;
  onConfirm:    () => void;
  onCancel:     () => void;
}

const SCREEN_H = Dimensions.get("window").height;

export function ConfirmSheet({
  visible, icon, title, message,
  confirmLabel = "Confirm", cancelLabel = "Cancel",
  danger = false, onConfirm, onCancel,
}: Props) {
  const { theme } = useTheme();
  const slide = useRef(new Animated.Value(SCREEN_H)).current;
  const fade  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fade,  { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(slide, { toValue: 0, tension: 75, friction: 11, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fade,  { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(slide, { toValue: SCREEN_H, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const confirmColor = danger ? theme.red : theme.primary;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onCancel}>
      {/* Dimmed backdrop */}
      <Animated.View style={[s.backdrop, { opacity: fade }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onCancel} />
      </Animated.View>

      {/* Bottom sheet */}
      <Animated.View style={[s.sheet, {
        backgroundColor: theme.card,
        transform: [{ translateY: slide }],
      }]}>
        <View style={[s.handle, { backgroundColor: theme.border }]} />

        {icon ? (
          <Text style={s.icon}>{icon}</Text>
        ) : null}

        <Text style={[s.title, { color: theme.text }]}>{title}</Text>

        {message ? (
          <Text style={[s.msg, { color: theme.sub }]}>{message}</Text>
        ) : null}

        <View style={[s.divider, { backgroundColor: theme.border }]} />

        <View style={s.buttons}>
          <TouchableOpacity
            style={[s.btn, { backgroundColor: theme.bg2, borderColor: theme.border, borderWidth: 1.5 }]}
            onPress={onCancel}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 15, fontWeight: "700", color: theme.text }}>{cancelLabel}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.btn, { backgroundColor: confirmColor }]}
            onPress={onConfirm}
            activeOpacity={0.82}
          >
            <Text style={{ fontSize: 15, fontWeight: "900", color: "#fff" }}>{confirmLabel}</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#00000065",
  },
  sheet: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 24, paddingBottom: 40, paddingTop: 14,
    alignItems: "center",
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 20, elevation: 20,
  },
  handle:  { width: 44, height: 4, borderRadius: 2, marginBottom: 20 },
  icon:    { fontSize: 52, marginBottom: 12, lineHeight: 64 },
  title:   { fontSize: 22, fontWeight: "900", textAlign: "center", marginBottom: 8 },
  msg:     { fontSize: 14, lineHeight: 22, textAlign: "center", marginBottom: 4 },
  divider: { height: 1, width: "100%", marginVertical: 20 },
  buttons: { flexDirection: "row", gap: 10, width: "100%" },
  btn:     { flex: 1, borderRadius: 16, paddingVertical: 15, alignItems: "center" },
});
