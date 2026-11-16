import mongoose from "mongoose";

// Company holidays (Holidays page): Diwali, Holi, 15 August ... One paid day
// off for every employee. Month Shift Register & Pay pays it like a weekly
// off; work done that day is paid on top. date is "YYYY-MM-DD", so it sorts
// and compares as text with no timezone shifting.
const holidaySchema = new mongoose.Schema(
  {
    date: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    addedBy: { type: String, default: "" }
  },
  { timestamps: true, collection: "holidays" }
);

export default mongoose.model("Holiday", holidaySchema);
