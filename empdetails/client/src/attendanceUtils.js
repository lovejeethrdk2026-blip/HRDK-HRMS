const PAIR_KEY = /^pair(\d+)$/;

export function pairNumbers(doc) {
  return Object.keys(doc)
    .filter((key) => PAIR_KEY.test(key))
    .map((key) => Number(key.match(PAIR_KEY)[1]))
    .sort((a, b) => a - b);
}

// doc.Date is "DD-MM-YYYY".
export function parseDisplayDate(displayDate) {
  const [d, m, y] = displayDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}

export function currentMonthIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
