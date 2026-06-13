import React from "react";
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  StyleSheet, TextInputProps, ViewStyle,
} from "react-native";
import { useTheme } from "../lib/theme-context";

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const { theme } = useTheme();
  return (
    <View style={[{
      backgroundColor: theme.card, borderRadius: 20, padding: 16,
      borderWidth: 1, borderColor: theme.border,
      shadowColor: theme.shadow, shadowOpacity: 1, shadowRadius: 12, elevation: 3,
    }, style]}>
      {children}
    </View>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const { label, ...rest } = props;
  const { theme } = useTheme();
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: theme.sub, fontSize: 13, marginBottom: 6, fontWeight: "700", letterSpacing: 0.5 }}>
        {label.toUpperCase()}
      </Text>
      <TextInput
        placeholderTextColor={theme.muted}
        style={{
          backgroundColor: theme.bg2, borderWidth: 1.5, borderColor: theme.border,
          borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13,
          fontSize: 16, color: theme.text,
        }}
        autoCapitalize="none"
        {...rest}
      />
    </View>
  );
}

export function Button({
  title, onPress, loading, variant = "primary", style,
}: {
  title: string; onPress: () => void; loading?: boolean;
  variant?: "primary" | "ghost" | "danger" | "success"; style?: ViewStyle;
}) {
  const { theme } = useTheme();
  const bg = {
    primary: theme.primary, ghost: "transparent",
    danger: theme.red, success: theme.green,
  }[variant];
  const fg = variant === "ghost" ? theme.primary : "#fff";
  return (
    <TouchableOpacity
      style={[{
        borderRadius: 14, paddingVertical: 15, alignItems: "center", justifyContent: "center",
        backgroundColor: bg,
        borderWidth: variant === "ghost" ? 1.5 : 0,
        borderColor: theme.primary,
      }, style]}
      onPress={onPress}
      disabled={!!loading}
      activeOpacity={0.8}
    >
      {loading
        ? <ActivityIndicator color={fg} />
        : <Text style={{ fontSize: 16, fontWeight: "800", color: fg, letterSpacing: 0.3 }}>{title}</Text>}
    </TouchableOpacity>
  );
}

export function ErrorText({ msg }: { msg: string | null }) {
  const { theme } = useTheme();
  if (!msg) return null;
  return (
    <View style={{ backgroundColor: theme.redLt, borderRadius: 10, padding: 10, marginBottom: 12 }}>
      <Text style={{ color: theme.red, fontWeight: "600", fontSize: 14 }}>{msg}</Text>
    </View>
  );
}

export function Chip({
  label, active, onPress, color,
}: { label: string; active?: boolean; onPress?: () => void; color?: string }) {
  const { theme } = useTheme();
  const c = color || theme.primary;
  return (
    <TouchableOpacity
      style={{
        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
        backgroundColor: active ? c : theme.bg2,
        borderWidth: 1.5, borderColor: active ? c : theme.border,
        marginRight: 8,
      }}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={{ fontSize: 13, fontWeight: "700", color: active ? "#fff" : theme.sub }}>{label}</Text>
    </TouchableOpacity>
  );
}
