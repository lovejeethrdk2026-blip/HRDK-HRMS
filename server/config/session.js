import session from "express-session";
import MongoStore from "connect-mongo";

// On Render the admin app is its own site (another *.onrender.com address), so
// the browser only keeps and sends the login cookie if it is SameSite=None +
// Secure. Render sets RENDER=true; CROSS_SITE_COOKIE=1 forces it elsewhere
// (needs https). Locally the admin goes through the Vite proxy, same site.
const crossSite = process.env.RENDER === "true" || process.env.CROSS_SITE_COOKIE === "1";

// Login sessions, saved in MongoDB so a server restart does not log anyone out.
const sessionMiddleware = session({
  proxy: crossSite, // behind Render's https proxy: trust X-Forwarded-Proto for the Secure cookie
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true, // every request gives the session 8 fresh hours (like a refresh)
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    stringify: false // save the session as an object, so we can find a user's sessions (logout all devices)
  }),
  cookie: {
    httpOnly: true,
    ...(crossSite ? { sameSite: "none", secure: true } : {}),
    maxAge: 1000 * 60 * 60 * 8 // 8 hours
  }
});

export default sessionMiddleware;
