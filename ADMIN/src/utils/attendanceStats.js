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

// The day's final punch, { time, type: "IN" | "OUT" }, or null when none.
// The register shows only the first pairs, so this keeps the leaving time
// visible on days with many punches.
export function lastPunch(doc) {
  let last = null;
  for (const pair of pairsOf(doc)) {
    if (pair.IN) last = { time: pair.IN, type: "IN" };
    if (pair.OUT) last = { time: pair.OUT, type: "OUT" };
  }
  return last;
}

// Every punch recorded for the day: gate IN/OUT across all pairs, plus
// punches at other machines (areaPunches).
export function punchCount(doc) {
  return pairsOf(doc).reduce((sum, pair) => sum + (pair.IN ? 1 : 0) + (pair.OUT ? 1 : 0), 0) + (doc.areaPunches?.length || 0);
}

// "11:02 LIBRARY, 14:30 G FOAM": punches at machines other than the gate.
export function areaPunchText(doc) {
  return (doc.areaPunches || []).map((punch) => `${hhmm(punch.time)} ${punch.device}`).join(", ");
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

    // The break ends at the very next punch, which must be an IN. If the next
    // punch is another OUT, the employee came back without an ENTRY punch,
    // so this OUT says nothing about the lunch length.
    const next = punches[i + 1];
    if (next && next.type !== "IN") continue;
    const back = next;
    if (!back) {
      if (out.seconds >= start) return { out: out.time, in: "", minutes: null };
      continue;
    }
    if (back.seconds < start) continue;

    return { out: out.time, in: back.time, minutes: Math.round((back.seconds - out.seconds) / 60) };
  }
  return null;
}

// ---------- IN / OUT from the gate machines ----------

// True when the row's IN/OUT came from the ENTRY / EXIT machines (server
// dailyRegister/devices.js); false when they were guessed by alternating.
export const directionKnown = (doc) => doc.direction === "device";

// "DD-MM-YYYY" -> YYYYMMDD
const dayNumber = (date) => {
  const [d, m, y] = String(date || "").split("-");
  return Number(`${y}${m}${d}`);
};

// Is the row's day (or night shift) finished, so an IN without an OUT is a
// missed EXIT punch rather than someone still inside?
export function dayIsOver(doc) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const today = Number(`${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yesterdayNum = Number(`${yesterday.getFullYear()}${pad(yesterday.getMonth() + 1)}${pad(yesterday.getDate())}`);
  // A night shift dated yesterday can still be running until noon today.
  return dayNumber(doc.Date) < (doc.nightShift ? yesterdayNum : today);
}

// Gate punches that are missing on a direction-known row:
// entry: an EXIT with no ENTRY before it (came back in without punching);
// exit: an ENTRY with no EXIT after it (left without punching), not counting
// the last one while the day is still running.
export function missedPunches(doc) {
  if (!directionKnown(doc)) return { entry: 0, exit: 0 };
  const pairs = pairsOf(doc);
  let entry = 0;
  let exit = 0;
  pairs.forEach((pair, i) => {
    if (pair.OUT && !pair.IN) entry++;
    if (pair.IN && !pair.OUT && (i < pairs.length - 1 || dayIsOver(doc))) exit++;
  });
  return { entry, exit };
}

// "No ENTRY ×2, No EXIT" or "".
export function missedText(doc) {
  const { entry, exit } = missedPunches(doc);
  const part = (n, label) => (n ? `${label}${n > 1 ? ` ×${n}` : ""}` : "");
  return [part(entry, "No ENTRY"), part(exit, "No EXIT")].filter(Boolean).join(", ");
}

// Time spent outside between leaving (EXIT) and coming back (next ENTRY),
// only where both punches exist, NOT counting the lunch time 13:00-15:00:
// going out for lunch inside that window is allowed. Out 12:30 -> back 15:30
// is 1:00 outside (12:30-13:00 and 15:00-15:30). Night shift rows have no
// lunch window. null on a guessed row.
export function outsideSeconds(doc) {
  if (!directionKnown(doc)) return null;
  const pairs = pairsOf(doc);
  const lunchFrom = toSeconds(LUNCH_START);
  const lunchTo = toSeconds(LUNCH_END);
  let seconds = 0;
  for (let i = 0; i < pairs.length - 1; i++) {
    const outAt = toSeconds(pairs[i].OUT);
    const backAt = toSeconds(pairs[i + 1].IN);
    if (outAt === null || backAt === null) continue;
    if (doc.nightShift) {
      seconds += backAt >= outAt ? backAt - outAt : backAt + 24 * 3600 - outAt;
      continue;
    }
    if (backAt < outAt) continue;
    const lunch = Math.max(0, Math.min(backAt, lunchTo) - Math.max(outAt, lunchFrom));
    seconds += backAt - outAt - lunch;
  }
  return seconds;
}

// Time out during the 13:00-15:00 lunch window (EXIT -> next ENTRY), the part
// Outside leaves out. null on a guessed row.
export function lunchOutSeconds(doc) {
  if (!directionKnown(doc) || doc.nightShift) return directionKnown(doc) ? 0 : null;
  const pairs = pairsOf(doc);
  const lunchFrom = toSeconds(LUNCH_START);
  const lunchTo = toSeconds(LUNCH_END);
  let seconds = 0;
  for (let i = 0; i < pairs.length - 1; i++) {
    const outAt = toSeconds(pairs[i].OUT);
    const backAt = toSeconds(pairs[i + 1].IN);
    if (outAt === null || backAt === null || backAt < outAt) continue;
    seconds += Math.max(0, Math.min(backAt, lunchTo) - Math.max(outAt, lunchFrom));
  }
  return seconds;
}

// Time between gate punches that can't be called inside or outside because a
// punch is missing: EXIT followed by another EXIT (came back without an ENTRY
// punch), or ENTRY followed by another ENTRY. With Total Working and Outside
// it adds up to the time from the first to the last gate punch. null on a
// guessed row.
export function unaccountedSeconds(doc) {
  if (!directionKnown(doc)) return null;
  const pairs = pairsOf(doc);
  let seconds = 0;
  for (let i = 0; i < pairs.length - 1; i++) {
    if (pairs[i].OUT && pairs[i + 1].IN) continue; // that gap is Outside
    const from = toSeconds(pairs[i].OUT || pairs[i].IN);
    const to = toSeconds(pairs[i + 1].IN || pairs[i + 1].OUT);
    if (from === null || to === null) continue;
    seconds += to >= from ? to - from : doc.nightShift ? to + 24 * 3600 - from : 0;
  }
  return seconds;
}

// "1:01", "0:00", or "" on a guessed row.
export function unaccountedText(doc) {
  const seconds = unaccountedSeconds(doc);
  return seconds === null ? "" : formatDuration(seconds);
}

// "1:25", "0:00", or "" on a guessed row.
export function outsideText(doc) {
  const seconds = outsideSeconds(doc);
  return seconds === null ? "" : formatDuration(seconds);
}

// Sum of every completed IN -> OUT pair. open: an IN without an OUT yet --
// on a direction-known row only while its day is still running (after that
// it is a missed EXIT, missedPunches). On a night shift row (noon to noon,
// server nightShift.js) an OUT earlier than its IN is after midnight:
// 21:00 -> 06:00 is 9 hours.
export function totalWorking(doc) {
  let seconds = 0;
  let open = false;
  const pairs = pairsOf(doc);

  pairs.forEach((pair, i) => {
    const inAt = toSeconds(pair.IN);
    const outAt = toSeconds(pair.OUT);
    if (inAt === null) return;
    if (outAt === null) {
      if (!directionKnown(doc) || (i === pairs.length - 1 && !dayIsOver(doc))) open = true;
      return;
    }
    if (outAt >= inAt) seconds += outAt - inAt;
    else if (doc.nightShift) seconds += outAt + 24 * 3600 - inAt;
  });

  // Unaccounted (missed-punch) gaps count as worked: the EXIT face reader
  // sits on the way to the washroom and logs false EXITs, so an EXIT -> EXIT
  // gap is the employee still inside.
  seconds += unaccountedSeconds(doc) || 0;

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
// over) or nothing to add up. Total Working already includes Unaccounted.
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

// Breaks that start in lunch time: every EXIT between 13:00 and 15:00, to the
// ENTRY that follows it, counted in full (13:50 -> 15:20 is 1:30). An EXIT
// with no ENTRY after it is "not back" while the day runs; on a finished day,
// or when the next punch is another EXIT (missed ENTRY), its length is unknown
// and it is left out. [{ out, in, seconds }] with in "" / seconds null when
// not back. Night shift rows have no lunch window.
export function lunchBreaks(doc) {
  if (doc.nightShift) return [];
  const from = toSeconds(LUNCH_START);
  const to = toSeconds(LUNCH_END);
  const pairs = pairsOf(doc);
  const breaks = [];
  pairs.forEach((pair, i) => {
    const out = toSeconds(pair.OUT);
    if (out === null || out < from || out > to) return;
    const next = pairs[i + 1];
    const back = toSeconds(next?.IN);
    if (back !== null && back >= out) breaks.push({ out: pair.OUT, in: next.IN, seconds: back - out });
    else if (!next && !dayIsOver(doc)) breaks.push({ out: pair.OUT, in: "", seconds: null });
  });
  return breaks;
}

// "45m", "1h 05m", "not back" (still out), or "" with no lunch break.
export function lunchTimeText(doc) {
  const breaks = lunchBreaks(doc);
  if (!breaks.length) return "";
  const total = breaks.reduce((sum, b) => sum + (b.seconds || 0), 0);
  const minutes = Math.round(total / 60);
  const h = Math.floor(minutes / 60);
  const text = h ? `${h}h ${String(minutes % 60).padStart(2, "0")}m` : minutes || !total ? `${minutes}m` : "<1m";
  const open = breaks.some((b) => b.seconds === null);
  if (open && !total) return "not back";
  return open ? `${text} + out` : text;
}

// "13:02–13:55, 14:10–…" for a tooltip.
export function lunchBreaksRange(doc) {
  return lunchBreaks(doc)
    .map((b) => `${hhmm(b.out)}–${b.in ? hhmm(b.in) : "…"}`)
    .join(", ");
}

// How many times the employee went out during lunch time (13:00-15:00):
// OUT punches whose time falls inside the window.
export function lunchOutCount(doc) {
  return pairsOf(doc).filter((pair) => pair.OUT && pair.OUT >= LUNCH_START && pair.OUT <= LUNCH_END).length;
}
