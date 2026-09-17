import axios from "axios";

const api = axios.create({
  baseURL: "/api"
});

// Access token lives only in memory (never localStorage), so injected scripts
// can't read it from storage. The refresh token is an httpOnly cookie the
// browser sends to /api/admin/auth/* by itself.
let accessToken = null;
let onSessionExpired = () => {};
let refreshPromise = null;

export function setSessionExpiredHandler(handler) {
  onSessionExpired = handler;
}

// Auth calls use plain axios, not `api`, so they never hit the retry interceptor below.
export async function loginAdmin(username, password) {
  const { data } = await axios.post(
    "/api/admin/auth/login",
    { username, password },
    { withCredentials: true }
  );
  accessToken = data.accessToken;
  return data.admin;
}

export async function logoutAdmin() {
  try {
    await axios.post("/api/admin/auth/logout", null, { withCredentials: true });
  } catch {
    // Local logout still happens; the server-side token expires on its own.
  } finally {
    accessToken = null;
  }
}

// Swaps the refresh cookie for a new access token (and a rotated cookie).
// Concurrent callers share one request, since each refresh token is single-use.
export function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = axios
      .post("/api/admin/auth/refresh", null, { withCredentials: true })
      .then(({ data }) => {
        accessToken = data.accessToken;
        return data.admin;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

// On 401 (access token expired), refresh once and replay the request.
// If refresh fails too, the session is over: send the admin back to login.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (error.response?.status !== 401 || !original || original._retried) {
      throw error;
    }
    original._retried = true;

    try {
      await refreshSession();
    } catch {
      accessToken = null;
      onSessionExpired();
      throw error;
    }

    return api(original);
  }
);

export default api;
