const Attendance = require("../models/Attendance");

const PAIR_KEY = /^pair(\d+)$/;

// "DD-MM-YYYY", the format Attendance.Date is stored in.
function todayDisplayDate() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${now.getFullYear()}`;
}

// Every IN/OUT on the document, in pair order: ["pair1 IN 09:30:00", ...]
function punchesOf(doc) {
  return Object.keys(doc)
    .filter((key) => PAIR_KEY.test(key))
    .sort((a, b) => Number(a.match(PAIR_KEY)[1]) - Number(b.match(PAIR_KEY)[1]))
    .flatMap((key) =>
      ["IN", "OUT"].filter((type) => doc[key]?.[type]).map((type) => `${key} ${type} ${doc[key][type]}`)
    );
}

// "ID|Date" -> punches last printed, so re-writes of unchanged data stay quiet.
const lastSeen = new Map();
let lastSeenDay = todayDisplayDate();

function logIfChanged(doc) {
  const today = todayDisplayDate();
  if (today !== lastSeenDay) {
    lastSeen.clear(); // new day: yesterday's entries are no longer needed
    lastSeenDay = today;
  }

  if (!doc || doc.Date !== today) return;

  const key = `${doc.ID}|${doc.Date}`;
  const punches = punchesOf(doc);
  const previous = lastSeen.get(key) || [];

  // Only the punches that weren't there last time.
  const added = punches.filter((punch) => !previous.includes(punch));
  lastSeen.set(key, punches);
  if (!added.length) return;

  const time = new Date().toLocaleTimeString("en-GB");
  console.log(`[${time}] IN/OUT update -> ID: ${doc.ID} | Name: ${doc.NAME || "-"} | ${added.join(", ")}`);
}

// Attendance is written into MongoDB by the COSEC sync running elsewhere, not
// by this server -- so watch the collection and print today's IN/OUT changes.
// That sync also re-writes old days in bulk, hence the today-only filter and
// the lastSeen de-duplication above.
function startAttendanceWatcher() {
  const pipeline = [{ $match: { operationType: { $in: ["insert", "update", "replace"] } } }];
  const stream = Attendance.watch(pipeline, { fullDocument: "updateLookup" });

  stream.on("change", (change) => logIfChanged(change.fullDocument));

  stream.on("error", (error) => {
    console.error("Attendance watcher stopped:", error.message);
    stream.close().catch(() => {});
    // Retry after a pause (e.g. network blip / Atlas failover).
    setTimeout(startAttendanceWatcher, 10000);
  });

  console.log("Watching attendance for IN/OUT updates...");
}

module.exports = { startAttendanceWatcher };
