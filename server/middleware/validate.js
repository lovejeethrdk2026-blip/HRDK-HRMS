import { ISO_DATE } from "../utils/validators.js";

// Route-level request checks. Each check takes the request and returns an
// error message, or null when the request is fine; the first problem found
// ends the request with 400 before the controller runs.
//
//   router.get("/:sheet", validate(dateRangeQuery), getPaySheet);
function validate(...checks) {
  return (req, res, next) => {
    for (const check of checks) {
      const problem = check(req);
      if (problem) return res.status(400).json({ message: problem });
    }
    next();
  };
}

// ?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD
function dateRangeQuery(req) {
  const { fromDate, toDate } = req.query;
  return [fromDate, toDate].every((d) => typeof d === "string" && ISO_DATE.test(d))
    ? null
    : "fromDate and toDate must be in YYYY-MM-DD format";
}

export { validate, dateRangeQuery };
