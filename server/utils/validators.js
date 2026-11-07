// Shared input rules, so the same field is checked the same way everywhere.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/; // "YYYY-MM-DD"
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/; // "YYYY-MM"

// Admin usernames: same rules on the first-run setup and the Admin Users page.
const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;
const MIN_PASSWORD_LENGTH = 8;

function normalizeUsername(username) {
  return typeof username === "string" ? username.trim().toLowerCase() : "";
}

function usernameProblem(normalized) {
  if (!USERNAME_PATTERN.test(normalized)) {
    return "Username must be 3-32 characters: letters, numbers, dot, dash or underscore";
  }
  return null;
}

function passwordProblem(password) {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return null;
}

export {
  ISO_DATE,
  MONTH_PATTERN,
  normalizeUsername,
  usernameProblem,
  passwordProblem
};
