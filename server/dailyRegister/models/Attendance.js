import mongoose from "mongoose";

// One document per employee per day. Punch pairs are stored as dynamic
// top-level keys (pair1, pair2, ...) rather than a fixed field, since an
// employee can have any number of IN/OUT pairs in a day:
// { ID, NAME, Date: "DD-MM-YYYY", pair1: { IN: "09:30:00", OUT: "12:20:00" }, pair2: {...} }
const attendanceSchema = new mongoose.Schema(
  {
    ID: {
      type: String,
      required: true
    },

    NAME: {
      type: String,
      default: ""
    },

    Date: {
      type: String,
      required: true
    },

    // Real Date mirror of the "DD-MM-YYYY" Date string above, set once at
    // write time (see Attendance.service.js) so reads can sort/filter using
    // an index instead of computing it via $dateFromString on every query --
    // that computed-field sort has no index to use and blows past MongoDB's
    // 32MB in-memory sort limit once the collection gets large (and Atlas's
    // free/shared tier doesn't support allowDiskUse to work around it).
    sortDate: {
      type: Date,
      required: true
    }
  },
  {
    strict: false,
    timestamps: true,

    // NOT "attendances". The external COSEC program is a near-copy of this
    // app and writes its own differently-shaped documents (refId +
    // financialYear + "DD-MM-YYYY" keys) into a collection of that name, in
    // whichever database it is pointed at -- which has included this app's.
    // Sharing it meant this app's records were wiped whenever that program
    // rebuilt, and its unique { refId, financialYear } index rejected this
    // app's second write outright (both null). A name of this app's own keeps
    // the two apart whatever database they end up sharing.
    collection: "attendance_days"
  }
);

attendanceSchema.index(
  {
    ID: 1,
    Date: 1
  },
  {
    unique: true
  }
);

attendanceSchema.index({ ID: 1, sortDate: -1 });

export default mongoose.model("Attendance", attendanceSchema);
