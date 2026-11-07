import mongoose from "mongoose";

// The Department page's own list: departments and their sub-department names,
// all added on that page. Nothing here comes from the Matrix COSEC employee
// master; that is a separate list.
const departmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },

    subDepartments: {
      type: [String],
      default: []
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model("Department", departmentSchema);
