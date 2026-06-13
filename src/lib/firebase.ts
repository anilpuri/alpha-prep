import { initializeApp, getApps, getApp } from "firebase/app";
// @ts-ignore — Metro resolves firebase/auth to the RN build which exports getReactNativePersistence
import { initializeAuth, getAuth, getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// Capture before init so we know if this is first load or a hot-reload
const existingApps = getApps();
const app = existingApps.length ? getApp() : initializeApp(firebaseConfig);

// On hot-reload the app already exists — use getAuth() to avoid the
// "initializeAuth called twice" error. On first load, init with AsyncStorage.
export const auth = existingApps.length
  ? getAuth(app)
  // @ts-ignore — Metro resolves firebase/auth to the RN build which exports this
  : initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });

export const db = getFirestore(app);
