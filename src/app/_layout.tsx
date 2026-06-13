import React, { useEffect, useRef, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { Animated, Image, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "../lib/auth-context";
import { ThemeProvider, useTheme } from "../lib/theme-context";

// AMOLED brand palette — hardcoded for guaranteed first-render branding
const SPLASH_BG  = "#000000";
const SPLASH_PRI = "#8880D5";
const SPLASH_LT  = "#1A1535";
const SPLASH_TXT = "#E0E0E0";
const SPLASH_SUB = "#787878";

// ── Expo-style chevron icon (gradient purple, transparent bg) ────────────────
function AMarkIcon() {
  return (
    <Image
      source={require("../../assets/images/splash-icon.png")}
      style={{ width: 72, height: 67 }}
      resizeMode="contain"
    />
  );
}

// ── App splash shown once on cold start ───────────────────────────────────────
function SplashOverlay({ onDone }: { onDone: () => void }) {
  const containerFade = useRef(new Animated.Value(1)).current;
  const logoScale     = useRef(new Animated.Value(0.6)).current;
  const logoFade      = useRef(new Animated.Value(0)).current;
  const textFade      = useRef(new Animated.Value(0)).current;
  const r1Scale       = useRef(new Animated.Value(0.4)).current;
  const r1Opacity     = useRef(new Animated.Value(0.7)).current;
  const r2Scale       = useRef(new Animated.Value(0.4)).current;
  const r2Opacity     = useRef(new Animated.Value(0.5)).current;
  const r3Scale       = useRef(new Animated.Value(0.4)).current;
  const r3Opacity     = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    // All three rings burst outward while logo springs in, then text fades in
    Animated.parallel([
      Animated.spring(logoScale, { toValue: 1,   useNativeDriver: true, tension: 65, friction: 7 }),
      Animated.timing(logoFade,  { toValue: 1,   duration: 400, useNativeDriver: true }),
      Animated.timing(r1Scale,   { toValue: 1.9, duration: 1000, useNativeDriver: true }),
      Animated.timing(r1Opacity, { toValue: 0,   duration: 1000, useNativeDriver: true }),
      Animated.timing(r2Scale,   { toValue: 1.6, duration: 1200, delay: 160, useNativeDriver: true }),
      Animated.timing(r2Opacity, { toValue: 0,   duration: 1200, delay: 160, useNativeDriver: true }),
      Animated.timing(r3Scale,   { toValue: 1.3, duration: 1400, delay: 320, useNativeDriver: true }),
      Animated.timing(r3Opacity, { toValue: 0,   duration: 1400, delay: 320, useNativeDriver: true }),
    ]).start(() => {
      Animated.timing(textFade, { toValue: 1, duration: 350, useNativeDriver: true }).start(() => {
        setTimeout(() => {
          Animated.timing(containerFade, { toValue: 0, duration: 400, useNativeDriver: true })
            .start(onDone);
        }, 850);
      });
    });
  }, []);

  const rings = [
    { scale: r1Scale, opacity: r1Opacity, alpha: "60" },
    { scale: r2Scale, opacity: r2Opacity, alpha: "45" },
    { scale: r3Scale, opacity: r3Opacity, alpha: "28" },
  ];

  return (
    <Animated.View style={[s.splash, { backgroundColor: SPLASH_BG, opacity: containerFade }]}>
      {/* Three concentric ripple rings */}
      {rings.map((r, i) => (
        <Animated.View key={i} style={[s.ring, {
          borderColor: SPLASH_PRI + r.alpha,
          opacity:     r.opacity,
          transform:   [{ scale: r.scale }],
        }]} />
      ))}

      {/* Logo circle */}
      <Animated.View style={[s.logoCircle, {
        backgroundColor: SPLASH_LT,
        borderColor:     SPLASH_PRI,
        shadowColor:     SPLASH_PRI,
        opacity:         logoFade,
        transform:       [{ scale: logoScale }],
      }]}>
        <AMarkIcon />
      </Animated.View>

      {/* App name + tagline */}
      <Animated.View style={{ alignItems: "center", marginTop: 32, opacity: textFade }}>
        <Text style={[s.appName, { color: SPLASH_TXT }]}>ALPHA</Text>
        <Text style={[s.tagline, { color: SPLASH_SUB }]}>SSC CGL Preparation</Text>
        <View style={{ flexDirection: "row", gap: 6, marginTop: 22 }}>
          {[0, 1, 2].map(i => (
            <View key={i} style={[s.dot, {
              backgroundColor: SPLASH_PRI,
              opacity: i === 1 ? 1 : 0.35,
              width:   i === 1 ? 22 : 6,
            }]} />
          ))}
        </View>
      </Animated.View>
    </Animated.View>
  );
}

// ── Auth gate ─────────────────────────────────────────────────────────────────
function Gate({ children }: { children: React.ReactNode }) {
  const { user, loading, emailVerified } = useAuth();
  const { theme } = useTheme();
  const segments  = useSegments();
  const router    = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === "(auth)";
    if (!user && !inAuth) {
      router.replace("/(auth)/login");
    } else if (user && !emailVerified && segments[0] === "(auth)" && (segments as string[])[1] !== "verify") {
      router.replace("/(auth)/verify");
    } else if (user && emailVerified && inAuth) {
      router.replace("/(tabs)");
    }
  }, [user, loading, emailVerified, segments]);

  // While auth loads show nothing (splash covers it)
  if (loading) return <View style={{ flex: 1, backgroundColor: theme.bg }} />;
  return <>{children}</>;
}

// ── Inner layout ──────────────────────────────────────────────────────────────
function InnerLayout() {
  const { theme, dark } = useTheme();
  const [splashDone, setSplashDone] = useState(false);

  return (
    <>
      <StatusBar style={dark ? "light" : "dark"} />
      <Gate>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.bg } }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="topic" />
          <Stack.Screen name="test" options={{ gestureEnabled: false }} />
          <Stack.Screen name="result" />
        </Stack>
      </Gate>

      {/* Splash overlays everything until animation completes */}
      {!splashDone && <SplashOverlay onDone={() => setSplashDone(true)} />}
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <InnerLayout />
      </AuthProvider>
    </ThemeProvider>
  );
}

const s = StyleSheet.create({
  splash: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
  ring: {
    position: "absolute",
    width: 190, height: 190, borderRadius: 95,
    borderWidth: 2,
  },
  logoCircle: {
    width: 114, height: 114, borderRadius: 57,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2,
    shadowOpacity: 0.5, shadowRadius: 28,
    shadowOffset: { width: 0, height: 0 }, elevation: 18,
  },
  appName:   { fontSize: 28, fontWeight: "900", letterSpacing: 8, marginTop: 4 },
  tagline:   { fontSize: 13, letterSpacing: 2, marginTop: 4 },
  dot:       { height: 6, borderRadius: 3 },
});
