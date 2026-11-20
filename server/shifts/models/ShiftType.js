import mongoose from "mongoose";

// The company's shifts (Employees > Shift > Shifts tab): a name and its In /
// Out time, e.g. "General" 10:00-19:00, "Night" 20:00-03:00 (Out earlier than
// In = night shift). Employees still keep their own shift.in / shift.out on
// the employee record (that is what the Daily Register reads); these are the
// named choices HR picks from when assigning, and the names shown for them.
const shiftTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    in: { type: String, required: true }, // "HH:mm"
    out: { type: String, required: true }, // "HH:mm"
    addedBy: { type: String, default: "" }
  },
  { timestamps: true, collection: "shift_types" }
);

export default mongoose.model("ShiftType", shiftTypeSchema);
