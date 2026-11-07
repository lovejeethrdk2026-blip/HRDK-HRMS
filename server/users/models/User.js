import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    // admin works across every department, so only managers and viewers need one
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: function () {
        return this.role !== "admin";
      }
    },
    // COSEC department (Daily Register) this user sees there; "" = every department
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
