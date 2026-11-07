import session from "express-session";
import MongoStore from "connect-mongo";

// Login sessions, saved in MongoDB so a server restart does not log anyone out.
const sessionMiddleware = session({
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
    maxAge: 1000 * 60 * 60 * 8 // 8 hours
  }
});

export default sessionMiddleware;
