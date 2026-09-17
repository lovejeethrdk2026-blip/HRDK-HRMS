const PAIR_KEY = /^pair(\d+)$/;

export function pairNumbers(doc) {
  return Object.keys(doc)
    .filter((key) => PAIR_KEY.test(key))
    .map((key) => Number(key.match(PAIR_KEY)[1]))
    .sort((a, b) => a - b);
}

export function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}
