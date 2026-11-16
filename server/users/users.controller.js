import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import User from "./models/User.js";
import Role from "../roles/models/Role.js";
import { accessFor } from "../roles/roles.controller.js";
import { departmentAccess, registerAccess, validateAccess } from "./userAccess.js";
import { ONLINE_MS, clearLastSeen } from "../middleware/lastSeen.js";

// REGISTER - create a new user
export const register = async (req, res) => {
  try {
    const { username, password, role } = req.body;

    // 1. all fields are needed (admin has no department: they see everything)
    if (!username || !password || !role) {
      return res.status(400).json({ message: "Username, password and role are required" });
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

    // 3. departments + sub departments, Daily Register departments + sections
    //    (users/userAccess.js); an admin sees everything, so none are kept
    let access = { departments: [], registerDepartments: [] };
    if (role !== "admin") {
      try {
        access = await validateAccess(req.body);
      } catch (error) {
        return res.status(400).json({ message: error.message });
      }
      if (!access.departments.length) {
        return res.status(400).json({ message: "Pick at least one department" });
      }
    }

    // 4. hash the password (never save the real password)
    const hashedPassword = await bcrypt.hash(password, 10);

    // 5. save the user
    const user = await User.create({ username, password: hashedPassword, role, ...access });

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
    res.json(
      users.map((user) => ({
        ...user,
        departments: departmentAccess(user),
        registerDepartments: registerAccess(user),
        online: Boolean(user.lastSeenAt && user.lastSeenAt.getTime() > since)
      }))
    );
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

// UPDATE USER - admin changes a user's username, role, department or Daily Register department
export const updateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const username = String(req.body.username ?? user.username).trim();
    const role = String(req.body.role ?? user.role);

    if (!username) {
      return res.status(400).json({ message: "Username is required" });
    }

    // 1. admin cannot change their own role (they would lock themselves out)
    if (user._id.toString() === req.session.userId && role !== user.role) {
      return res.status(400).json({ message: "You cannot change your own role" });
    }

    // 2. always keep at least one admin
    if (user.role === "admin" && role !== "admin" && (await User.countDocuments({ role: "admin" })) <= 1) {
      return res.status(400).json({ message: "The last admin must stay an admin" });
    }

    // 3. role must be "admin" or one from the Roles & Permissions page
    if (role !== "admin" && !(await Role.findOne({ name: role }))) {
      return res.status(400).json({ message: "Role not found" });
    }

    // 4. username must not belong to someone else
    if (username !== user.username && (await User.exists({ username, _id: { $ne: user._id } }))) {
      return res.status(400).json({ message: "Username already exists" });
    }

    // 5. departments + sub departments, Daily Register departments + sections
    let access = { departments: [], registerDepartments: [] };
    if (role !== "admin") {
      try {
        access = await validateAccess(req.body);
      } catch (error) {
        return res.status(400).json({ message: error.message });
      }
      if (!access.departments.length) {
        return res.status(400).json({ message: "Pick at least one department" });
      }
    }

    user.username = username;
    user.role = role;
    user.departments = access.departments;
    user.registerDepartments = access.registerDepartments;
    user.managerName = access.managerName || "";
    // the old single fields are replaced by the lists above
    user.department = undefined;
    user.registerDepartment = "";
    await user.save();

    // logged-in sessions keep the role, so update it there too
    await mongoose.connection
      .collection("sessions")
      .updateMany({ "session.userId": user._id.toString() }, { $set: { "session.role": role } });

    res.json({ message: `${user.username} updated` });
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

    const plain = user.toObject();
    res.json({ ...plain, departments: departmentAccess(plain), registerDepartments: registerAccess(plain), ...access });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
