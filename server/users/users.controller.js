import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import User from "./models/User.js";
import Department from "../department/models/Department.js";
import Role from "../roles/models/Role.js";
import RegisterEmployee from "../dailyRegister/models/Employee.js";
import { accessFor } from "../roles/roles.controller.js";
import { ONLINE_MS, clearLastSeen } from "../middleware/lastSeen.js";

// REGISTER - create a new user
export const register = async (req, res) => {
  try {
    const { username, password, role, department } = req.body;
    // admin sees every Daily Register department, so none is kept
    const registerDepartment = role === "admin" ? "" : String(req.body.registerDepartment || "").trim();

    // 1. all fields are needed (admin has no department: they see everything)
    if (!username || !password || !role) {
      return res.status(400).json({ message: "Username, password and role are required" });
    }
    if (role !== "admin" && !department) {
      return res.status(400).json({ message: "Department is required for this role" });
    }

    // role must be "admin" or one from the Roles & Permissions page
    if (role !== "admin" && !(await Role.findOne({ name: role }))) {
      return res.status(400).json({ message: "Role not found" });
    }

    // 2. username must be new
    const userExists = await User.findOne({ username });
    if (userExists) {
      return res.status(400).json({ message: "Username already exists" });
    }

    // 3. department is sent by name, e.g. "WAX" (not for admin)
    let departmentId = undefined;
    if (role !== "admin") {
      const dept = await Department.findOne({ name: department });
      if (!dept) {
        return res.status(400).json({ message: "Department not found" });
      }
      departmentId = dept._id;
    }

    // Daily Register department is a COSEC department name, e.g. "WAX" (optional)
    if (registerDepartment && !(await RegisterEmployee.exists({ department: registerDepartment }))) {
      return res.status(400).json({ message: "Daily Register department not found" });
    }

    // 4. hash the password (never save the real password)
    const hashedPassword = await bcrypt.hash(password, 10);

    // 5. save the user
    const user = await User.create({
      username,
      password: hashedPassword,
      role,
      department: departmentId,
      registerDepartment
    });

    res.status(201).json({ message: "User registered", userId: user._id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// LIST USERS - every user with their department name (admin page)
export const listUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select("-password")
      .populate("department", "name")
      .sort({ createdAt: -1 })
      .lean();

    // online = used the app in the last few minutes (middleware/lastSeen.js)
    const since = Date.now() - ONLINE_MS;
    res.json(users.map((user) => ({ ...user, online: Boolean(user.lastSeenAt && user.lastSeenAt.getTime() > since) })));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// SETUP - create the very first admin (works only while there are no users)
export const setupAdmin = async (req, res) => {
  try {
    const count = await User.countDocuments();
    if (count > 0) {
      return res.status(400).json({ message: "Setup already done. Login as admin to add users." });
    }

    req.body.role = "admin"; // the first user is always an admin
    return register(req, res);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// LOGIN - check username + password, then start a session
export const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // 1. find the user
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ message: "Invalid username or password" });
    }

    // 2. check the password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid username or password" });
    }

    // 3. save the user in the session (this logs them in)
    req.session.userId = user._id.toString();
    req.session.role = user.role;

    res.json({ message: "Login successful", username: user.username, role: user.role });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// LOGOUT - end the session
export const logout = async (req, res) => {
  if (req.session.userId) await clearLastSeen(req.session.userId).catch(() => {});
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ message: "Logged out" });
  });
};

// LOGOUT ALL DEVICES - end every session of this user (phone, other PCs, this one)
export const logoutAll = async (req, res) => {
  try {
    const result = await mongoose.connection
      .collection("sessions")
      .deleteMany({ "session.userId": req.session.userId });
    await clearLastSeen(req.session.userId);

    // also end this request's session, so it is not saved again
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ message: "Logged out from all devices", sessionsEnded: result.deletedCount });
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// CHANGE PASSWORD - logged-in user changes their own password
export const changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    // 1. both passwords are needed
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ message: "Old and new password are required" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    }

    // 2. old password must be right
    const user = await User.findById(req.session.userId);
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Old password is wrong" });
    }

    // 3. save the new password (hashed)
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    // 4. log out the other devices, keep this one logged in
    await mongoose.connection
      .collection("sessions")
      .deleteMany({ "session.userId": req.session.userId, _id: { $ne: req.sessionID } });

    res.json({ message: "Password changed" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// RESET PASSWORD - admin creates a new password for a user who forgot theirs
export const resetPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;

    // 1. new password is needed
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    }

    // 2. find the user
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 3. save the new password (hashed)
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    // 4. log that user out everywhere, so they must login with the new password
    await mongoose.connection.collection("sessions").deleteMany({ "session.userId": user._id.toString() });
    await clearLastSeen(user._id.toString());

    res.json({ message: `New password set for ${user.username}` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// DELETE USER - admin removes a user's login
export const deleteUser = async (req, res) => {
  try {
    // 1. admin cannot delete their own login
    if (req.params.id === req.session.userId) {
      return res.status(400).json({ message: "You cannot delete your own login" });
    }

    // 2. find the user
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 3. always keep at least one admin
    if (user.role === "admin" && (await User.countDocuments({ role: "admin" })) <= 1) {
      return res.status(400).json({ message: "The last admin cannot be deleted" });
    }

    // 4. delete, and log that user out everywhere
    await user.deleteOne();
    await mongoose.connection.collection("sessions").deleteMany({ "session.userId": user._id.toString() });

    res.json({ message: `${user.username} deleted` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ME - who is logged in right now
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.session.userId)
      .select("-password")
      .populate("department", "name");

    // what this user may do, from their role (Roles & Permissions page)
    const access = await accessFor(user.role);

    res.json({ ...user.toObject(), ...access });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
