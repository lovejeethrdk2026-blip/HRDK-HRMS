import mongoose from "mongoose";

// One document per background job, recording where it got to and how the
// last run went (shown on the Attendance page via GET /api/attendance/sync).
const syncStateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true
    },

    // Newest punchTime seen so far. Informational only -- it is NOT the
    // incremental watermark: the external COSEC puller imports days out of
    // chronological order, so a single stray future punch would otherwise
    // make every older day it imports later invisible forever.
    lastPunchTime: {
      type: Date,
      default: null
    },

    // The incremental watermark: newest syncedAt (the instant the external
    // puller wrote the row) processed so far. That value only ever moves
    // forward as rows are inserted, whatever punchTime they carry, so
    // back-filled days are always picked up.
    lastSyncedAt: {
      type: Date,
      default: null
    },

    lastRunAt: { type: Date, default: null },
    lastRunMode: { type: String, default: "" }, // "full" or "incremental"
    lastRunPunches: { type: Number, default: 0 },
    lastRunDocs: { type: Number, default: 0 },
    lastRunDayKeyedDocs: { type: Number, default: 0 }, // from the COSEC program's own day records
    lastRunMs: { type: Number, default: 0 },
    lastError: { type: String, default: "" }
  },
  {
    timestamps: true
  }
);

export default mongoose.model("SyncState", syncStateSchema);
