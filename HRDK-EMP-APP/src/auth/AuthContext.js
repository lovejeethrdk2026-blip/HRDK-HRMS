import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { setSignedOutHandler, tokens } from "../api/client";
import { getProfile, login, logout as apiLogout } from "../api/me";
import { connectLive, disconnectLive, useLive } from "../api/live";

// Who is logged in. On start the saved login key is tried (GET /me/profile);
// if it works the employee goes straight in, otherwise to Login.

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [employee, setEmployee] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    setSignedOutHandler(() => setEmployee(null));
    (async () => {
      try {
        if (await tokens.get()) setEmployee(await getProfile());
      } catch {
        await tokens.clear();
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  const signIn = useCallback(async (employeeId, password) => {
    const who = await login(employeeId, password);
    setEmployee(who);
  }, []);

  const signOut = useCallback(async () => {
    await apiLogout();
    setEmployee(null);
  }, []);

  // Fetches the employee again (Home pull-to-refresh), so switches HR changed
  // in Employee App settings reach the app without logging out.
  const refresh = useCallback(async () => {
    try {
      setEmployee(await getProfile());
    } catch {
      // keep what we have; a signed-out answer goes through the handler above
    }
  }, []);

  // Live refresh connection while logged in (api/live.js).
  const who = employee?.employeeId || "";
  useEffect(() => {
    if (!who) return undefined;
    connectLive();
    return () => disconnectLive();
  }, [who]);
  // HR changed what the app shows, the employee's details, or their login
  // (turned off / new password / exit): ask again; a login that no longer
  // works sends the app back to Login.
  useLive(["settings", "account", "profile"], refresh);

  return <AuthContext.Provider value={{ employee, checking, signIn, signOut, refresh }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

// What HR lets this app show (server: Employee App settings). Everything on
// when the server does not send them (older server, demo data).
const ALL_ON = { attendance: true, punchTimes: true, leave: true, leaveApply: true, salary: true, chat: true, documents: true, profileEdit: true };
export function useFeatures() {
  const { employee } = useAuth();
  return { ...ALL_ON, ...(employee?.features || {}) };
}
