require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

// Access tokens are signed with this; refuse to start with a missing/weak one
// rather than silently issuing forgeable tokens.
if (!process.env.JWT_ACCESS_SECRET || process.env.JWT_ACCESS_SECRET.length < 32) {
  console.error("JWT_ACCESS_SECRET must be set in server/.env (at least 32 characters).");
  process.exit(1);
}

const connectDB = require("./config/db");
const { startAttendanceWatcher } = require("./services/attendanceWatcher");
const adminAuthRoutes = require("./routes/AdminAuth.route");
const adminUserRoutes = require("./routes/AdminUser.route");
const attendanceRoutes = require("./routes/Attendance.route");
const employeeRoutes = require("./routes/Employee.route");
const leaveRoutes = require("./routes/Leave.route");

const app = express();

// credentials: the admin refresh token travels in a cookie, which browsers
// only send cross-origin to an explicitly named origin (not "*").
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "*",
    credentials: Boolean(process.env.CLIENT_ORIGIN)
  })
);
app.use(express.json());
app.use(cookieParser());

app.use("/api/admin/auth", adminAuthRoutes);
app.use("/api/admin/users", adminUserRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/employee", employeeRoutes);
app.use("/api/leave", leaveRoutes);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    startAttendanceWatcher();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("MongoDB connection error:", error);
  });
