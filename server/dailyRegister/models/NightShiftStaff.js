import mongoose from "mongoose";

// Employees ticked as night shift in the Daily Register's "Night Shift Staff"
// dialog. Kept in its own collection rather than on `employees`, which the
// COSEC sync rewrites, so a tick is never lost to a sync run.
const nightShiftStaffSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, unique: true }
  },
  {
    timestamps: true,
    collection: "night_shift_staff"
  }
);

export default mongoose.model("NightShiftStaff", nightShiftStaffSchema);
