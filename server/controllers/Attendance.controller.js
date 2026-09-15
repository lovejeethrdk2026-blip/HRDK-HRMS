const Attendance = require("../models/Attendance");

// "YYYY-MM-DD" -> "DD-MM-YYYY"
function toDisplayDate(isoDate) {
  const [y, m, d] = isoDate.split("-");
  return `${d}-${m}-${y}`;
}

// "DD-MM-YYYY" -> comparable number (YYYYMMDD), for sorting in JS instead of
// relying on the derived sortDate field (see note below).
function dateSortKey(displayDate) {
  const [d, m, y] = displayDate.split("-");
  return Number(`${y}${m}${d}`);
}

// YYYYMMDD number -> "DD-MM-YYYY", the inverse of dateSortKey.
function displayDateFromSortKey(sortKey) {
  const s = String(sortKey);
  return `${s.slice(6, 8)}-${s.slice(4, 6)}-${s.slice(0, 4)}`;
}

async function getAttendance(req, res) {
  try {
    const { employeeId, date, month } = req.query; // date: YYYY-MM-DD, month: YYYY-MM

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(500, parseInt(req.query.limit, 10) || 100);

    const match = {};
    if (employeeId) match.ID = employeeId;
    if (date) match.Date = toDisplayDate(date);

    if (month) {
      const [y, m] = month.split("-"); // already "YYYY-MM", zero-padded
      // Date is stored as "DD-MM-YYYY" -- match the month/year segments as a
      // string pattern directly, instead of comparing the derived sortDate
      // field. sortDate keeps getting wiped by something outside this app
      // (still unresolved), so filtering on it made this silently return
      // zero results whenever that happened; this match never depends on it.
      match.Date = { $regex: `^\\d{2}-${m}-${y}$` };
    }

    const [records, total] = await Promise.all([
      Attendance.find(match, { sortDate: 0 })
        .sort({ ID: 1, sortDate: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Attendance.countDocuments(match)
    ]);

    // Re-sort this page's rows in JS by the real Date string, ascending
    // (oldest first) -- the DB-level sort above uses sortDate, which keeps
    // getting wiped by something outside this app (still unresolved), so it
    // can't be trusted for ordering. Safe to do here since a page is capped
    // at `limit` rows (default 100, max 500).
    records.sort((a, b) => {
      if (a.ID !== b.ID) return a.ID < b.ID ? -1 : 1;
      return dateSortKey(a.Date) - dateSortKey(b.Date);
    });

    res.json({
      records,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// One row per employee: their most recent day's document (with all its pairs).
async function getLatestAttendance(req, res) {
  try {
    // Find each employee's max Date (as YYYYMMDD) via $group/$max -- a single
    // streaming pass over the collection, not a $sort stage, so it never hits
    // the Atlas M0 32MB in-memory-sort limit. This replaces sorting/grouping
    // by the derived sortDate field, which keeps getting wiped by something
    // outside this app (still unresolved) and was silently picking a stale
    // (or no) "latest" doc per employee.
    const maxDates = await Attendance.aggregate([
      {
        $addFields: {
          _dateNum: {
            $toInt: {
              $concat: [
                { $substrCP: ["$Date", 6, 4] },
                { $substrCP: ["$Date", 3, 2] },
                { $substrCP: ["$Date", 0, 2] }
              ]
            }
          }
        }
      },
      { $group: { _id: "$ID", maxDateNum: { $max: "$_dateNum" } } }
    ]);

    // Fetch each employee's full latest-day document via the unique
    // {ID, Date} index -- targeted equality lookups, not a collection scan.
    const latestConditions = maxDates.map((row) => ({
      ID: row._id,
      Date: displayDateFromSortKey(row.maxDateNum)
    }));

    const records = latestConditions.length
      ? await Attendance.find({ $or: latestConditions }, { sortDate: 0 })
          .sort({ ID: 1 })
          .lean()
      : [];

    res.json(records);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

module.exports = {
  getAttendance,
  getLatestAttendance
};
