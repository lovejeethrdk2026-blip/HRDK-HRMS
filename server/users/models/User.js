import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    // Departments (Department page) this user works in, each with the picked
    // sub departments; [] sub departments = the whole department. Admins: none.
    departments: {
      type: [{ _id: false, name: String, subDepartments: { type: [String], default: [] } }],
      default: []
    },
    // COSEC departments (Daily Register) this user sees, each with the picked
    // sections; [] = every department / every section.
    registerDepartments: {
      type: [{ _id: false, name: String, sections: { type: [String], default: [] } }],
      default: []
    },
    // Before multi-select: one department and one Daily Register department.
    // Still read for users not edited since (users/userAccess.js).
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department"
    },
    registerDepartment: {
      type: String,
      default: ""
    },
    // "admin", or a role from the Roles & Permissions page (e.g. "manager")
    role: {
      type: String,
      required: true
    },
    password: {
      type: String,
      required: true
    },
    // last request while logged in (middleware/lastSeen.js); null after logout
    // Chat: this login answers the employees whose "Reporting manager" is this
    // name (as typed on the employee's record), e.g. "SATYA PRAKASH SHARMA".
    managerName: {
      type: String,
      default: ""
    },
    lastSeenAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model("User", userSchema);
