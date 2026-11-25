import { createContext, useContext, useEffect, useState } from "react";
import api from "../api/axios";
import { setPayrollSettings, setPayVersions } from "@salary";

// GET /payroll-settings into the shared salary formulas (Payroll Settings page),
// with every pay version (each employee's pay is worked out with their own).
export async function loadPayrollSettings() {
  try {
    const { data } = await api.get("/payroll-settings");
    setPayrollSettings(data.values);
    setPayVersions(data.versions || []);
  } catch {
    /* keep the defaults */
  }
}

// Who is logged in, shared with the whole app. The server keeps the login in a
// session cookie (server/users), so on load we just ask GET /users/me.

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // the logged-in user, null when logged out
  const [checking, setChecking] = useState(true); // true until we know

  async function loadMe() {
    try {
      const { data } = await api.get("/users/me");
      // A static host answers unknown URLs with index.html (HTML, not a user):
      // VITE_API_URL is missing, so the API was never reached.
      if (!data || typeof data !== "object") throw new Error("API not reached");
      // Payroll Settings (PF / ESIC / PT rates) before any page works out a
      // salary split, so the app matches the server. Defaults if it fails.
      await loadPayrollSettings();
      setUser(data);
      return true;
    } catch {
      setUser(null);
      return false;
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    loadMe();
  }, []);

  async function login(username, password) {
    await api.post("/users/login", { username, password });
    // Password was right but the browser did not keep the session cookie
    // (e.g. VITE_API_URL points at another site): say so instead of spinning.
    if (!(await loadMe())) {
      throw new Error("Logged in, but the browser did not keep the login. Check VITE_API_URL in ADMIN/.env.");
    }
  }

  async function logout() {
    await api.post("/users/logout").catch(() => {});
    setUser(null);
  }

  async function logoutAll() {
    await api.post("/users/logout-all").catch(() => {});
    setUser(null);
  }

  // May the logged-in user do this? e.g. can("employees.add"). From their
  // role on the Roles & Permissions page; admins get everything except what
  // is hidden for admins there (GET /users/me sends the list for both).
  function can(permission) {
    if (!user) return false;
    return (user.permissions || []).includes(permission);
  }

  // Re-reads what the user may do, e.g. after the admin changes the Admin
  // column on the Roles & Permissions page.
  async function refreshAccess() {
    try {
      const { data } = await api.get("/users/me");
      setUser(data);
    } catch {
      /* keep what we have */
    }
  }

  const value = { user, checking, can, refreshAccess, login, logout, logoutAll };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

// "admin" -> "Administrator"; a role made on the Roles page shows its own name
export const ROLE_LABELS = { admin: "Administrator", manager: "Manager", viewer: "Viewer" };
export const roleLabel = (role) => ROLE_LABELS[role] || String(role ?? "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
