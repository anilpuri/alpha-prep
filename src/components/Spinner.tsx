import React, { useEffect, useRef } from "react";
import { Animated, Easing, Text, View } from "react-native";
import { useTheme } from "../lib/theme-context";

interface Props {
  color?:    string;  // arc color — defaults to theme.primary
  size?:     number;  // outer ring diameter — default 96
  icon?:     string;  // emoji in pulsing centre
  label?:    string;  // bold text below
  sublabel?: string;  // muted text below label
}

export function Spinner({ color, size = 96, icon, label, sublabel }: Props) {
  const { theme } = useTheme();
  const tint = color ?? theme.primary;

  const spinAnim  = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    const spin = Animated.loop(
      Animated.timing(spinAnim, { toValue: 1, duration: 1300, easing: Easing.linear, useNativeDriver: true })
    );
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 850, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.95, duration: 850, useNativeDriver: true }),
      ])
    );
    spin.start();
    pulse.start();
    return () => { spin.stop(); pulse.stop(); };
  }, []);

  const spinDeg   = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const inner     = size * 0.7;
  const bw        = Math.max(2.5, size * 0.034);
  const iconSize  = Math.round(size * 0.33);

  return (
    <View style={{ alignItems: "center" }}>
      <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        <Animated.View style={{
          position: "absolute",
          width: size, height: size, borderRadius: size / 2,
          borderWidth: bw,
          borderTopColor: tint,
          borderRightColor: tint + "55",
          borderBottomColor: "transparent",
          borderLeftColor:   "transparent",
          transform: [{ rotate: spinDeg }],
        }} />
        <Animated.View style={{
          width: inner, height: inner, borderRadius: inner / 2,
          backgroundColor: tint + "14",
          alignItems: "center", justifyContent: "center",
          transform: [{ scale: pulseAnim }],
        }}>
          {icon ? <Text style={{ fontSize: iconSize }}>{icon}</Text> : null}
        </Animated.View>
      </View>

      {label ? (
        <Text style={{ color: theme.text, fontSize: 17, fontWeight: "900", marginTop: 22, letterSpacing: 0.2 }}>
          {label}
        </Text>
      ) : null}
      {sublabel ? (
        <Text style={{ color: theme.muted, fontSize: 12, marginTop: 12 }}>
          {sublabel}
        </Text>
      ) : null}
    </View>
  );
}
