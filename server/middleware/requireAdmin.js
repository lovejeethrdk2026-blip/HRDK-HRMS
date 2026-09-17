const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");

// Verifies the short-lived admin access token from "Authorization: Bearer <token>",
// then confirms the account still exists and is active -- so disabling an
// admin locks them out immediately instead of when their token expires.
async function requireAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ message: "Admin login required" });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET, { algorithms: ["HS256"] });
  } catch (error) {
    const message =
      error.name === "TokenExpiredError" ? "Access token expired" : "Invalid access token";
    return res.status(401).json({ message });
  }

  if (payload.role !== "admin") {
    return res.status(403).json({ message: "Admin access only" });
  }

  try {
    const active = await Admin.exists({ _id: payload.sub, isActive: true });
    if (!active) {
      return res.status(401).json({ message: "Admin account is no longer active" });
    }
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(401).json({ message: "Invalid access token" });
    }
    return res.status(500).json({ message: error.message });
  }

  req.admin = { id: payload.sub, username: payload.username };
  next();
}

// For endpoints the employee portal also uses: a request scoped to one
// employee (?employeeId=) passes through, anything listing all employees
// needs an admin token. employeeId must be a plain string: a query like
// ?employeeId[$ne]=x parses to an object and would otherwise act as a Mongo
// operator that matches every employee.
function requireAdminUnlessEmployeeScoped(req, res, next) {
  const { employeeId } = req.query;
  if (typeof employeeId === "string" && employeeId.trim()) return next();
  return requireAdmin(req, res, next);
}

module.exports = { requireAdmin, requireAdminUnlessEmployeeScoped };
