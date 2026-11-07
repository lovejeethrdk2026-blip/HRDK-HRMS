import mongoose from "mongoose";
import { cosecDb } from "../../config/cosecDb.js";

// Employee master maintained by the external COSEC sync (read-only here).
// Only employee ID, name and department are read from it.
const cosecEmployeeSchema = new mongoose.Schema(
  {
    employeeId: String,
    name: String,
    fullName: String,
    department: String
  },
  {
    strict: false,
    collection: "employees",
    autoIndex: false,
    autoCreate: false
  }
);

export default cosecDb.model("CosecEmployee", cosecEmployeeSchema);
