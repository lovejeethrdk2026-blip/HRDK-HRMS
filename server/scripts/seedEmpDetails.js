// One-time (and safely re-runnable) seed: creates an EmpDetails login
// record for every distinct employee already in the Attendance collection,
// username = employee ID, password = employee ID (same scheme as before,
// now backed by a real credentials collection instead of derived on the
// fly). Run:
//   node scripts/seedEmpDetails.js
require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Attendance = require("../models/Attendance");
const EmpDetails = require("../models/EmpDetails");

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  // One employee per ID, using their most recent NAME.
  const employees = await Attendance.aggregate([
    { $sort: { ID: 1, sortDate: -1 } },
    { $group: { _id: "$ID", name: { $first: "$NAME" } } }
  ]);

  console.log(`Found ${employees.length} distinct employees.`);

  let created = 0;
  let skipped = 0;

  for (const { _id: employeeId, name } of employees) {
    const exists = await EmpDetails.findOne({ employeeId });
    if (exists) {
      skipped++;
      continue;
    }

    const passwordHash = await bcrypt.hash(employeeId, 10);

    await EmpDetails.create({
      employeeId,
      name: name || "",
      username: employeeId,
      passwordHash
    });

    created++;
  }

  console.log(`Created ${created} new EmpDetails records, ${skipped} already existed.`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
