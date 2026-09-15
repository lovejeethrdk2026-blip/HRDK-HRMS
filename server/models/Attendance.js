const mongoose = require("mongoose");

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
    timestamps: true
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

module.exports = mongoose.model("Attendance", attendanceSchema);
