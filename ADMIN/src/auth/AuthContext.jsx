import { createContext, useContext, useEffect, useState } from "react";
import api from "../api/axios";

// Who is logged in, shared with the whole app. The server keeps the login in a
// session cookie (server/users), so on load we just ask GET /users/me.

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // the logged-in user, null when logged out
  const [checking, setChecking] = useState(true); // true until we know

  async function loadMe() {
    try {
      const { data } = await api.get("/users/me");
      setUser(data);
    } catch {
      setUser(null);
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    loadMe();
  }, []);

  async function login(username, password) {
    await api.post("/users/login", { username, password });
    await loadMe();
  }

  async function logout() {
    await api.post("/users/logout").catch(() => {});
    setUser(null);
  }

  async function logoutAll() {
    await api.post("/users/logout-all").catch(() => {});
    setUser(null);
  }

  // May the logged-in user do this? e.g. can("employees.add"). Admin may do everything.
  function can(permission) {
    if (!user) return false;
    return user.role === "admin" || (user.permissions || []).includes(permission);
  }

  const value = { user, checking, can, login, logout, logoutAll };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

// "admin" -> "Administrator"; a role made on the Roles page shows its own name
export const ROLE_LABELS = { admin: "Administrator", manager: "Manager", viewer: "Viewer" };
export const roleLabel = (role) => ROLE_LABELS[role] || String(role ?? "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
