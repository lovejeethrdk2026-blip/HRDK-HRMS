import axios from "axios";

// Server address comes from VITE_API_URL in ADMIN/.env. Default "/api" uses the
// Vite dev proxy (vite.config.js) or the same host the built app is served from.
export const API_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/+$/, "");

const api = axios.create({
  baseURL: API_URL
});

// Short cache for lists many pages read when they open (employees,
// departments, ...): opening another menu page within a minute reuses the
// answer instead of waiting on the database again, and two pages asking at
// once share one request. Any save (POST / PUT / PATCH / DELETE) empties the
// cache, so a page reloading after its own save always gets fresh data.
const CACHED = [/^\/employees$/, /^\/departments$/, /^\/holidays$/, /^\/leave\/types$/, /^\/roles$/];
const TTL_MS = 60 * 1000;
const cache = new Map(); // url -> { at, promise }
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
