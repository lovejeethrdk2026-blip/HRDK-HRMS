// AUTHENTICATION - who are you?
// Only lets the request go on if someone is logged in.
export const isLoggedIn = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Please login first" });
  }
  next();
};

// AUTHORIZATION - what are you allowed to do?
// Only lets the request go on if the logged-in user has one of these roles.
// Use it after isLoggedIn, e.g. authorize("admin") or authorize("admin", "manager").
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.session.role)) {
      return res.status(403).json({ message: "You are not allowed to do this" });
    }
    next();
  };
};
