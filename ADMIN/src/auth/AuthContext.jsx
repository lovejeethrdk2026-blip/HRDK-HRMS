import { createContext, useContext, useEffect, useState } from "react";
import { loginAdmin, logoutAdmin, refreshSession, setSessionExpiredHandler } from "../api/axios";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [checking, setChecking] = useState(true); // restoring session from the refresh cookie

  useEffect(() => {
    setSessionExpiredHandler(() => setAdmin(null));

    refreshSession()
      .then(setAdmin)
      .catch(() => setAdmin(null))
      .finally(() => setChecking(false));
  }, []);

  async function login(username, password) {
    setAdmin(await loginAdmin(username, password));
  }

  async function logout() {
    await logoutAdmin();
    setAdmin(null);
  }

  return (
    <AuthContext.Provider value={{ admin, checking, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
