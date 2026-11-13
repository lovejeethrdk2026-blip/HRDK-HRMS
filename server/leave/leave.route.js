import express from "express";
import { isLoggedIn } from "../middleware/auth.js";
import { accessFor } from "../roles/roles.controller.js";
import {
  applyLeave,
  cancelLeave,
  createType,
  decideLeave,
  listApplications,
  listBalances,
  listEmployees,
  listTypes,
  setAdjustment,
  updateType
} from "./leave.controller.js";

// Signed-in users whose role has one of these permissions (admins always do).
const allowed =
  (...keys) =>
  async (req, res, next) => {
    try {
      const { permissions } = await accessFor(req.session.role);
      if (keys.some((key) => permissions.includes(key))) return next();
      res.status(403).json({ message: "You are not allowed to do this" });
    } catch (error) {
      next(error);
    }
  };

const router = express.Router();
router.use(isLoggedIn);

// Leave types (Leave > Leave types).
router.get("/types", allowed("leave.view"), listTypes);
router.post("/types", allowed("leave.manage"), createType);
router.put("/types/:code", allowed("leave.manage"), updateType);

// Employees leave can be applied for (COSEC master, user's departments).
router.get("/employees", allowed("leave.view"), listEmployees);

// Applications: apply, then approve / reject; cancel a pending or approved one.
router.get("/applications", allowed("leave.view"), listApplications);
router.post("/applications", allowed("leave.apply"), applyLeave);
router.post("/applications/:id/decision", allowed("leave.approve"), decideLeave);
router.post("/applications/:id/cancel", allowed("leave.approve"), cancelLeave);

// Balances per financial year, and a per-employee adjustment (carry forward etc.).
router.get("/balances", allowed("leave.view"), listBalances);
router.put("/adjustments", allowed("leave.manage"), setAdjustment);

export default router;
