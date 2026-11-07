import mongoose from "mongoose";

// This app's own copy of employee ID, name and department from the COSEC
// employee master, in MONGO_URI's database. dailyRegister/cosecSync.js upserts it
// on every run that finds that master populated, so the Daily Register keeps
// its names and departments even when the external COSEC sync program resets
// its database -- which it did on 2026-09-23.
const employeeSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,
      required: true,
      unique: true
    },

    name: {
      type: String,
      default: ""
    },

    department: {
      type: String,
      default: ""
    },

    // When this row was last copied from the COSEC master.
    syncedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model("Employee", employeeSchema);
