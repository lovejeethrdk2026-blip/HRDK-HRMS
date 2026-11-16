import { Platform } from "react-native";
import * as NativeSecureStore from "expo-secure-store";
import { demoRequest } from "./demo";

// expo-secure-store has no web version; the web build exists only to preview
// screens on a PC, so it keeps the keys in browser storage. Phones always use
// the secure store.
const SecureStore =
  Platform.OS === "web"
    ? {
        getItemAsync: async (key) => globalThis.localStorage?.getItem(key) ?? null,
        setItemAsync: async (key, value) => globalThis.localStorage?.setItem(key, value),
        deleteItemAsync: async (key) => globalThis.localStorage?.removeItem(key)
      }
    : NativeSecureStore;

// The one link between the app and the HRMS server (server/, routes under
// /api/me). The address comes from .env (EXPO_PUBLIC_API_URL) while
// developing and from eas.json for each build (test / live).
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || "").replace(/\/+$/, "");
export const DEMO = process.env.EXPO_PUBLIC_DEMO === "1";

const ACCESS = "hrdk.accessToken";
const REFRESH = "hrdk.refreshToken";

// Login keys live in the phone's secure storage (Android Keystore / iOS Keychain).
export const tokens = {
  get: () => SecureStore.getItemAsync(ACCESS),
  async set({ accessToken, refreshToken }) {
    if (accessToken) await SecureStore.setItemAsync(ACCESS, accessToken);
    if (refreshToken) await SecureStore.setItemAsync(REFRESH, refreshToken);
  },
  async clear() {
    await SecureStore.deleteItemAsync(ACCESS);
    await SecureStore.deleteItemAsync(REFRESH);
  },
  refresh: () => SecureStore.getItemAsync(REFRESH)
};

// Called when the session can't be renewed (AuthContext sends the user to Login).
let onSignedOut = () => {};
export function setSignedOutHandler(fn) {
  onSignedOut = fn;
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function send(path, { method = "GET", body, token } = {}) {
  let res;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(body !== undefined && { "Content-Type": "application/json" }),
        ...(token && { Authorization: `Bearer ${token}` })
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your internet connection.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.message || `Request failed (${res.status})`);
  return data;
}

// One refresh at a time, shared by requests that hit an expired token together.
let refreshing = null;
async function renew() {
  refreshing ??= (async () => {
    const refreshToken = await tokens.refresh();
    if (!refreshToken) throw new ApiError(401, "Please log in again");
    const data = await send("/me/auth/refresh", { method: "POST", body: { refreshToken } });
    await tokens.set(data);
    return data.accessToken;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

// Sends one picked file (expo-document-picker asset) as the raw request body,
// with the login key: apiUpload("/me/documents?title=Photo", asset).
export async function apiUpload(path, asset) {
  if (DEMO) throw new ApiError(501, "Uploading works with the live server only (demo mode).");
  const token = await tokens.get();
  const body = asset.file || (await (await fetch(asset.uri)).blob());
  let res;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": asset.mimeType || "application/octet-stream",
        ...(token && { Authorization: `Bearer ${token}` })
      },
      body
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your internet connection.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.message || `Upload failed (${res.status})`);
  return data;
}

// api("/me/leave"), api("/me/leave", { method: "POST", body: {...} }).
// Adds the login key; on 401 renews it once and retries.
export async function api(path, options = {}) {
  if (DEMO) return demoRequest(path, options);
  const token = await tokens.get();
  try {
    return await send(path, { ...options, token });
  } catch (error) {
    if (error.status !== 401 || !token || options.noRetry) throw error;
    try {
      const fresh = await renew();
      return await send(path, { ...options, token: fresh });
    } catch (again) {
      await tokens.clear();
      onSignedOut();
      throw again;
    }
  }
}
