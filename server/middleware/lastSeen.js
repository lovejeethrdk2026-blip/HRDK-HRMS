import User from "../users/models/User.js";

// ONLINE - a user counts as online while they keep using the app.
// Every logged-in request notes the time on their user (at most once a
// minute per user, so the pages that refresh often don't write each time).
export const ONLINE_MS = 3 * 60 * 1000; // active in the last 3 minutes = online
const WRITE_EVERY_MS = 60 * 1000;
const lastWrite = new Map(); // userId -> when lastSeenAt was last saved

export const trackLastSeen = (req, res, next) => {
  const userId = req.session?.userId;
  if (userId && Date.now() - (lastWrite.get(userId) || 0) > WRITE_EVERY_MS) {
    lastWrite.set(userId, Date.now());
    User.updateOne({ _id: userId }, { lastSeenAt: new Date() }).catch(() => lastWrite.delete(userId));
  }
  next();
};

// LOGOUT - show the user offline at once, not after ONLINE_MS
export const clearLastSeen = async (userId) => {
  lastWrite.delete(userId);
  await User.updateOne({ _id: userId }, { lastSeenAt: null });
};
