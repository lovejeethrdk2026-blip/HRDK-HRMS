// One-time backfill: adds the `sortDate` field (see models/Attendance.js)
// to Attendance documents written before that field existed, computing it
// from their "DD-MM-YYYY" Date string. Run once:
//   node scripts/backfillSortDate.js
require("dotenv").config();

const mongoose = require("mongoose");
const Attendance = require("../models/Attendance");

const BATCH_SIZE = 1000;

function parseDisplayDate(displayDate) {
  const [d, m, y] = displayDate.split("-");
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  const cursor = Attendance.find({ sortDate: { $exists: false } }, { Date: 1 }).cursor();

  let batch = [];
  let total = 0;

  async function flush() {
    if (!batch.length) return;
    await Attendance.bulkWrite(batch, { ordered: false });
    total += batch.length;
    console.log(`Backfilled ${total} documents...`);
    batch = [];
  }

  for await (const doc of cursor) {
    batch.push({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: { sortDate: parseDisplayDate(doc.Date) } }
      }
    });

    if (batch.length >= BATCH_SIZE) await flush();
  }

  await flush();

  console.log(`Done. Backfilled ${total} documents total.`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
