// Derived figures for one attendance day record ({ pair1: { IN, OUT }, ... },
// times as "HH:mm:ss" wall-clock strings): the lunch break and total working time.

const PAIR_KEY = /^pair(\d+)$/;

// A full working day; Total Working is compared against it.
export const FULL_DAY_HOURS = 8;

// Lunch window: a punch OUT inside it counts as going for lunch.
export const LUNCH_START = "13:00:00";
export const LUNCH_END = "15:00:00";

// The record's pairs in order: [{ IN, OUT }, ...]
export function pairsOf(doc) {
  return Object.keys(doc)
    .filter((key) => PAIR_KEY.test(key))
    .map((key) => Number(key.match(PAIR_KEY)[1]))
    .sort((a, b) => a - b)
    .map((n) => doc[`pair${n}`] || {});
}

// Every IN and OUT value recorded for the day, across all pairs.
export function punchCount(doc) {
  return pairsOf(doc).reduce((sum, pair) => sum + (pair.IN ? 1 : 0) + (pair.OUT ? 1 : 0), 0);
}

function toSeconds(time) {
  if (typeof time !== "string") return null;
  const [h, m, s = "0"] = time.split(":");
  if (h === undefined || m === undefined || Number.isNaN(Number(h)) || Number.isNaN(Number(m))) return null;
  return Number(h) * 3600 + Number(m) * 60 + (Number(s) || 0);
}

// "HH:mm:ss" -> "HH:mm"
export function hhmm(time) {
  return typeof time === "string" ? time.slice(0, 5) : "";
}

// seconds -> "H:MM"
export function formatDuration(seconds) {
  if (seconds === null || seconds === undefined || seconds < 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

// Lunch = the first time out (an OUT punch until the next IN) that overlaps
// the 13:00–15:00 window; a break that starts before 13:00 or ends after
// 15:00 still counts in full. An OUT inside the window with no IN after it
// is a lunch that has not ended yet (in: "", minutes: null). null when no
// break touches the window, and always for a night shift row (its punches
// run past midnight, and its break is not at 13:00-15:00).
export function lunchBreak(doc) {
  if (doc.nightShift) return null;
  const start = toSeconds(LUNCH_START);
  const end = toSeconds(LUNCH_END);

  const punches = pairsOf(doc)
    .flatMap((pair) => [
      { time: pair.IN, type: "IN" },
      { time: pair.OUT, type: "OUT" }
    ])
    .map((punch) => ({ ...punch, seconds: toSeconds(punch.time) }))
    .filter((punch) => punch.seconds !== null)
    .sort((a, b) => a.seconds - b.seconds);

  for (let i = 0; i < punches.length; i++) {
    const out = punches[i];
    if (out.type !== "OUT" || out.seconds > end) continue;

    const back = punches.slice(i + 1).find((punch) => punch.type === "IN");
    if (!back) {
      if (out.seconds >= start) return { out: out.time, in: "", minutes: null };
      continue;
    }
    if (back.seconds < start) continue;

    return { out: out.time, in: back.time, minutes: Math.round((back.seconds - out.seconds) / 60) };
  }
  return null;
}

// Sum of every completed IN -> OUT pair. open: an IN without an OUT yet.
// On a night shift row (noon to noon, server nightShift.js) an OUT earlier
// than its IN is after midnight: 21:00 -> 06:00 is 9 hours.
export function totalWorking(doc) {
  let seconds = 0;
  let open = false;

  for (const pair of pairsOf(doc)) {
    const inAt = toSeconds(pair.IN);
    const outAt = toSeconds(pair.OUT);
    if (inAt === null) continue;
    if (outAt === null) {
      open = true;
      continue;
    }
    if (outAt >= inAt) seconds += outAt - inAt;
    else if (doc.nightShift) seconds += outAt + 24 * 3600 - inAt;
  }

  return { seconds, open, hasAny: seconds > 0 || open };
}

// Break length only: "45m", "1h 11m"; "not back" while the break is still
// on; "" when no break touches the lunch window.
export function lunchText(doc) {
  const lunch = lunchBreak(doc);
  if (!lunch) return "";
  if (lunch.minutes === null) return "not back";
  const h = Math.floor(lunch.minutes / 60);
  const m = lunch.minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

// "13:02 – 13:47" (or "13:02 – …" when only one punch is in the window).
export function lunchRange(doc) {
  const lunch = lunchBreak(doc);
  if (!lunch) return "";
  return `${hhmm(lunch.out)} – ${lunch.in ? hhmm(lunch.in) : "…"}`;
}

// ---------- Shift (Add Employee > Employee shift, doc.shift { in, out } "HH:mm") ----------

// Coming in or going out within this many minutes of the shift time is on time.
export const GRACE_MINUTES = 10;

const DAY = 24 * 3600;

// The row's shift, or null when the employee has none: { in, out } as
// seconds since midnight, length in seconds (past midnight when Out < In).
function shiftOf(doc) {
  const start = toSeconds(doc.shift?.in);
  const end = toSeconds(doc.shift?.out);
  if (start === null || end === null || start === end) return null;
  return { in: start, out: end, length: (end - start + DAY) % DAY };
}

// "09:30–18:30", or "" without a shift.
export function shiftText(doc) {
  return shiftOf(doc) ? `${doc.shift.in}–${doc.shift.out}` : "";
}

// Seconds of work that make a full day. With a shift: its length, less one
// hour for lunch when it is a day shift spanning the 13:00–15:00 lunch window
// (09:30–18:30 -> 8 hours; 20:00–03:00 -> 7 hours). Without: FULL_DAY_HOURS.
export function fullDaySeconds(doc) {
  const shift = shiftOf(doc);
  if (!shift) return FULL_DAY_HOURS * 3600;
  const lunch = shift.out > shift.in && shift.in <= toSeconds(LUNCH_START) && shift.out >= toSeconds(LUNCH_END);
  return Math.max(0, shift.length - (lunch ? 3600 : 0));
}

// "8:00": the full day this row is measured against.
export function fullDayText(doc) {
  return formatDuration(fullDaySeconds(doc));
}

// The day's first IN and last OUT as seconds ({ first, last }, null when missing).
function firstAndLast(doc) {
  const pairs = pairsOf(doc);
  const ins = pairs.map((pair) => toSeconds(pair.IN)).filter((s) => s !== null);
  const outs = pairs.map((pair) => toSeconds(pair.OUT)).filter((s) => s !== null);
  return { first: ins.length ? ins[0] : null, last: outs.length ? outs[outs.length - 1] : null };
}

// b - a in seconds, folded into -12h..+12h, so 03:10 vs 03:00 is +10 minutes
// on a night shift whatever the date.
function clockDiff(a, b) {
  return ((b - a + DAY + DAY / 2) % DAY) - DAY / 2;
}

// Seconds the first IN came after the shift In, past the grace time; 0 when on
// time, null without a shift or an IN.
export function lateSeconds(doc) {
  const shift = shiftOf(doc);
  const { first } = firstAndLast(doc);
  if (!shift || first === null) return null;
  const late = clockDiff(shift.in, first);
  return late > GRACE_MINUTES * 60 ? late : 0;
}

// Seconds the last OUT came before the shift Out, past the grace time; 0 when
// on time, null without a shift, an OUT, or while still clocked in.
export function earlyOutSeconds(doc) {
  const shift = shiftOf(doc);
  const { last } = firstAndLast(doc);
  if (!shift || last === null || totalWorking(doc).open) return null;
  const early = clockDiff(last, shift.out);
  return early > GRACE_MINUTES * 60 ? early : 0;
}

// "0:22" late, "" when on time or not known.
export function lateText(doc) {
  const late = lateSeconds(doc);
  return late ? formatDuration(late) : "";
}

// "1:30" left early, "" when on time or not known.
export function earlyOutText(doc) {
  const early = earlyOutSeconds(doc);
  return early ? formatDuration(early) : "";
}

// Worked time against the row's full day (fullDaySeconds): "+0:30" over,
// "-1:15" short, "0:00" exactly; "" while still clocked in (the day isn't
// over) or nothing to add up.
export function vsFullDayText(doc) {
  const total = totalWorking(doc);
  if (!total.hasAny || total.open) return "";
  const diff = total.seconds - fullDaySeconds(doc);
  const text = formatDuration(Math.abs(diff));
  if (diff > 0) return `+${text}`;
  return diff < 0 ? `-${text}` : text;
}

// "8:15", "5:20 (in)" while still clocked in, "" when nothing to add up.
export function totalWorkingText(doc) {
  const total = totalWorking(doc);
  if (!total.hasAny) return "";
  const text = formatDuration(total.seconds);
  return total.open ? `${text} (in)` : text;
}
