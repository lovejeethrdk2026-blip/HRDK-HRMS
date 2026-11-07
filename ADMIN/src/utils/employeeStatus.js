import { isWorkingOn, openExitOf } from "@salary";

// Whether an employee is on the rolls today, for the Employees page's Active /
// Inactive buttons and the Dashboard and Department counts.

// Today as "YYYY-MM-DD", on this computer's clock.
function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// "active" (working, no exit), "leaving" (exit entered, last working day still
// ahead: still Active) or "left" (Inactive).
export function statusOf(employee) {
  if (!openExitOf(employee)) return "active";
  return isWorkingOn(employee, today()) ? "leaving" : "left";
}

// Still on the rolls today (active or leaving).
export const isActive = (employee) => statusOf(employee) !== "left";
