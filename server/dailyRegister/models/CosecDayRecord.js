import mongoose from "mongoose";
import { cosecDb } from "../../config/cosecDb.js";

// The external COSEC program's OWN day records (read-only here), which it
// writes into the same `attendances` collection this app uses, in a different
// shape: one document per employee per financial year, with the punch pairs
// of each day hung off a "DD-MM-YYYY" key.
//
//   { refId: "10106", name, userName, financialYear: "2026-2027",
//     fromDate: "01-04-2026", toDate: "31-03-2027",
//     "22-09-2026": [ { in: "07:35:53", out: "10:12:34" }, ... ] }
//
// This is a SECOND, separate feed from the raw `punches` collection
// (models/Punch.js): the program back-fills history as punch rows while
// writing the current days only here, so days that never appear as punches
// would otherwise be missing from this app entirely. dailyRegister/cosecSync.js
// converts these into this app's own day documents (models/Attendance.js).
//
// This app keeps its own day records in a separate collection
// (models/Attendance.js -> "attendance_days"), so the two never mix.
const cosecDayRecordSchema = new mongoose.Schema(
  {
    refId: String,
    name: String,
    userName: String,
    financialYear: String
  },
  {
    strict: false,
    collection: "attendances",
    // Never create or alter indexes on another application's collection.
    autoIndex: false,
    autoCreate: false
  }
);

export default cosecDb.model("CosecDayRecord", cosecDayRecordSchema);
