import axios from "axios";

// Server address comes from VITE_API_URL in ADMIN/.env. Default "/api" uses the
// Vite dev proxy (vite.config.js) or the same host the built app is served from.
export const API_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/+$/, "");

const api = axios.create({
  baseURL: API_URL,
  // Send the login cookie when the server is another site (admin on Render).
  withCredentials: true
});

// Short cache for lists many pages read when they open (employees,
// departments, ...): opening another menu page within a minute reuses the
// answer instead of waiting on the database again, and two pages asking at
// once share one request. Any save (POST / PUT / PATCH / DELETE) empties the
// cache, so a page reloading after its own save always gets fresh data.
// Live refresh (api/live.js) sets where the open socket's id comes from; it
// goes with every request so the server does not tell this tab about its own
// saves.
let socketIdOf = () => undefined;
export const setLiveSocketId = (fn) => {
  socketIdOf = fn;
};
api.interceptors.request.use((config) => {
  const id = socketIdOf();
  if (id) config.headers["X-Socket-Id"] = id;
  return config;
});

const CACHED = [/^\/employees$/, /^\/departments$/, /^\/holidays$/, /^\/leave\/types$/, /^\/roles$/];
const TTL_MS = 60 * 1000;
const cache = new Map(); // url -> { at, promise }
// Live refresh: another user or the sync changed something, read it fresh.
export const clearApiCache = () => cache.clear();
const send = axios.getAdapter(api.defaults.adapter);

api.defaults.adapter = (config) => {
  const method = String(config.method || "get").toLowerCase();
  if (method !== "get") {
    cache.clear();
    return send(config);
  }
  const url = config.url || "";
  const hasParams = config.params && Object.keys(config.params).length > 0;
  if (hasParams || !CACHED.some((pattern) => pattern.test(url))) return send(config);

  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise.then((response) => ({ ...response, config }));
  const promise = send(config);
  cache.set(url, { at: Date.now(), promise });
  promise.catch(() => cache.delete(url));
  return promise;
};

export default api;
