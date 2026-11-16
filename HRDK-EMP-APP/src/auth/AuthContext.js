import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { setSignedOutHandler, tokens } from "../api/client";
import { getProfile, login, logout as apiLogout } from "../api/me";

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

  const signIn = useCallback(async (employeeId) => {
    const who = await login(employeeId);
    setEmployee(who);
  }, []);

  const signOut = useCallback(async () => {
    await apiLogout();
    setEmployee(null);
  }, []);

  return <AuthContext.Provider value={{ employee, checking, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
