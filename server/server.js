require("dotenv").config();

const express = require("express");
const cors = require("cors");

const connectDB = require("./config/db");
const { startAttendanceWatcher } = require("./services/attendanceWatcher");
const attendanceRoutes = require("./routes/Attendance.route");
const employeeRoutes = require("./routes/Employee.route");
const leaveRoutes = require("./routes/Leave.route");

const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN || "*" }));
app.use(express.json());

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
