import express from "express";
import { getPaySheet } from "./paySheet.controller.js";
import { getEmpCost } from "./empCost.controller.js";
import { validate, dateRangeQuery } from "../middleware/validate.js";
import { isLoggedIn } from "../middleware/auth.js";

const router = express.Router();

// Salary data: signed-in users only, so each one's department scope applies.
router.use(isLoggedIn);

// Emp Cost report: Pay Sheet 1 amounts with each employee's department.
// Before /:sheet, so "emp-cost" is not taken for a sheet number.
router.get("/emp-cost", validate(dateRangeQuery), getEmpCost);
// Pay Sheet 1, 2 or 3 for a date range, relayed from the Pay Sheet app.
router.get("/:sheet", validate(dateRangeQuery), getPaySheet);

export default router;
