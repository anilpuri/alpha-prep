import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendEmailVerification, sendPasswordResetEmail, signOut, updateProfile, User,
} from "firebase/auth";
import { auth } from "./firebase";
import { ensureUserDoc } from "./db";

interface AuthCtx {
  user:                User | null;
  loading:             boolean;
  emailVerified:       boolean;
  register:            (name: string, email: string, password: string) => Promise<void>;
  login:               (email: string, password: string) => Promise<void>;
  logout:              () => Promise<void>;
  resendVerification:  () => Promise<void>;
  refreshVerification: () => Promise<boolean>;
  forgotPassword:      (email: string) => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,          setUser]          = useState<User | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [emailVerified, setEmailVerified] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, u => {
      setUser(u);
      setEmailVerified(!!u?.emailVerified);
      setLoading(false);
    });
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    await updateProfile(cred.user, { displayName: name.trim() });
    await sendEmailVerification(cred.user);
    ensureUserDoc(cred.user.uid, email.trim(), name.trim()).catch(() => {});
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    setEmailVerified(!!cred.user.emailVerified);
  }, []);

  const logout = useCallback(() => signOut(auth), []);

  const resendVerification = useCallback(async () => {
    if (auth.currentUser) await sendEmailVerification(auth.currentUser);
  }, []);

  const refreshVerification = useCallback(async () => {
    if (!auth.currentUser) return false;
    await auth.currentUser.reload();
    const ok = !!auth.currentUser.emailVerified;
    setEmailVerified(ok);
    return ok;
  }, []);

  const forgotPassword = useCallback(
    (email: string) => sendPasswordResetEmail(auth, email.trim()), []);

  return (
    <Ctx.Provider value={{
      user, loading, emailVerified,
      register, login, logout,
      resendVerification, refreshVerification, forgotPassword,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
