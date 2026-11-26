// Server-wide protection against common attacks. Used in server.js, before
// the routes:
//   securityHeaders  browser safety headers (no framing, no sniffing, https only)
//   checkOrigin      saves with the admin login cookie only from the admin site (CSRF)
//   cleanInput       drops "$..." keys from body / query (MongoDB operator injection)
//   loginGuard       too many wrong logins from one IP or for one user = pause

const onRender = process.env.RENDER === "true";

// ---------- headers ----------

export function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff"); // files are what they say they are
  res.setHeader("X-Frame-Options", "DENY"); // no showing our pages inside another site (clickjacking)
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  if (onRender) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains"); // https only
  if (req.path.startsWith("/api/")) {
    // API answers are data, never a page to run.
    res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    // Payslips, documents, employee details: no copies kept by the browser or a proxy.
    res.setHeader("Cache-Control", "no-store");
  } else {
    res.setHeader("Content-Security-Policy", "frame-ancestors 'none'; object-src 'none'; base-uri 'self'");
  }
  next();
}

// ---------- CSRF ----------

// On Render the admin cookie is SameSite=None, so a browser also sends it when
// another website posts to this server. A save (POST / PUT / PATCH / DELETE)
// that carries the cookie must therefore come from an allowed admin site.
// The employee app (/api/me) uses its own login key, not a cookie.
const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export function checkOrigin(allowedOrigins) {
  const allowed = new Set(allowedOrigins);
  return (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    if (!req.path.startsWith("/api/") || req.path.startsWith("/api/me/")) return next();
    if (!req.headers.cookie) return next(); // no login cookie: nothing to misuse
    let origin = req.headers.origin;
    if (!origin && req.headers.referer) {
      try {
        origin = new URL(req.headers.referer).origin;
      } catch {
        origin = "bad";
      }
    }
    if (!origin) return next(); // not a browser (browsers always send Origin on a cross-site save)
    const sameSite = origin.replace(/^https?:\/\//, "") === req.headers.host;
    if (sameSite || allowed.has(origin) || (!onRender && local.test(origin))) return next();
    console.warn(`Blocked save from another site: ${origin} ${req.method} ${req.originalUrl}`);
    res.status(403).json({ message: "Request blocked: not from the HRMS admin site" });
  };
}

// ---------- operator injection ----------

// {"username": {"$ne": null}} or ?id[$gt]= would turn a value into a MongoDB
// query operator. No screen sends keys starting with "$", so they are dropped.
function clean(value, depth = 0) {
  if (!value || typeof value !== "object" || depth > 20) return value;
  for (const key of Object.keys(value)) {
    if (key.startsWith("$") || key === "__proto__" || key === "constructor" || key === "prototype") delete value[key];
    else clean(value[key], depth + 1);
  }
  return value;
}

export function cleanInput(req, res, next) {
  clean(req.body);
  clean(req.query);
  clean(req.params);
  next();
}

// ---------- login tries ----------

// In memory (one server). Each key counts wrong logins in a 15-minute window;
// over the limit = that key paused for 15 minutes.
const WINDOW_MS = 15 * 60 * 1000;
const tries = new Map(); // key -> { count, since, pausedUntil }

function entry(key, now) {
  let e = tries.get(key);
  if (!e || (now - e.since > WINDOW_MS && !(e.pausedUntil > now))) {
    e = { count: 0, since: now, pausedUntil: 0 };
    tries.set(key, e);
  }
  return e;
}

// Old entries go, so the map cannot grow without end.
setInterval(() => {
  const now = Date.now();
  for (const [key, e] of tries) if (now - e.since > WINDOW_MS && !(e.pausedUntil > now)) tries.delete(key);
}, WINDOW_MS).unref();

// loginGuard({ name, userOf, perUser, perIp }): runs before a login route.
// Wrong answer (400 / 401 / 404) counts a try for the user and the IP; a good
// login clears the user's count.
export function loginGuard({ name, userOf = () => "", perUser = 5, perIp = 30 }) {
  return (req, res, next) => {
    const now = Date.now();
    const user = String(userOf(req) ?? "").trim().toLowerCase().slice(0, 100);
    const keys = [[`${name}|ip|${req.ip}`, perIp]];
    if (user) keys.push([`${name}|user|${user}`, perUser]);
    for (const [key] of keys) {
      const e = entry(key, now);
      if (e.pausedUntil > now) {
        const minutes = Math.ceil((e.pausedUntil - now) / 60000);
        res.setHeader("Retry-After", String(Math.ceil((e.pausedUntil - now) / 1000)));
        return res.status(429).json({ message: `Too many wrong logins. Try again in ${minutes} minutes.` });
      }
    }
    res.on("finish", () => {
      const at = Date.now();
      if ([400, 401, 404].includes(res.statusCode)) {
        for (const [key, limit] of keys) {
          const e = entry(key, at);
          e.count += 1;
          if (e.count >= limit) {
            e.pausedUntil = at + WINDOW_MS;
            e.count = 0;
            console.warn(`Login paused 15 min: ${key}`);
          }
        }
      } else if (res.statusCode < 300 && user) {
        tries.delete(`${name}|user|${user}`);
      }
    });
    next();
  };
}

// For tests.
export const _resetLoginTries = () => tries.clear();
