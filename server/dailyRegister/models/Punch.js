import mongoose from "mongoose";
import { cosecDb } from "../../config/cosecDb.js";

// Raw punch rows written by the external COSEC sync (read-only here):
// { employeeId: "10395", employeeName, punchDirection: 0, punchTime: Date,
//   sourceSystem, sourceTable, sourceRecordId, syncedAt }
// punchTime is the reader's wall-clock time stored as if it were UTC -- see
// PUNCH_TIME_ZONE in dailyRegister/cosecSync.js.
const punchSchema = new mongoose.Schema(
  {
    employeeId: String,
    employeeName: String,
    punchDirection: Number,
    punchTime: Date,
    syncedAt: Date
  },
  {
    strict: false,
    collection: "punches",
    // Never create or alter indexes on another application's collection.
    autoIndex: false,
    autoCreate: false
  }
);

export default cosecDb.model("Punch", punchSchema);
