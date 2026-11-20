import express from "express";
import { isLoggedIn } from "../middleware/auth.js";
import { accessFor } from "../roles/roles.controller.js";
import ShiftType from "./models/ShiftType.js";
import EmployeeProfile from "../employee/models/EmployeeProfile.js";
import User from "../users/models/User.js";
import { clearShiftCache } from "../dailyRegister/employeeShifts.js";

// Employees > Shift > Shifts tab: the company's named shifts.
// GET    /api/shifts            -> [{ _id, name, in, out }] (by In time)
// POST   /api/shifts            { name, in, out }
// PUT    /api/shifts/:id        { name, in, out, moveEmployees }
//        moveEmployees: also give the new times to everyone on the old ones
// DELETE /api/shifts/:id        (employees keep their times)

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

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const shape = (s) => ({ _id: s._id, name: s.name, in: s.in, out: s.out });

// { shift } or { error } from a request body.
function readBody(body) {
  const name = String(body?.name ?? "").trim().slice(0, 40);
  const start = String(body?.in ?? "").trim();
  const end = String(body?.out ?? "").trim();
  if (!name) return { error: "Type the shift name" };
  if (!TIME.test(start)) return { error: "In must be a time like 09:30" };
  if (!TIME.test(end)) return { error: "Out must be a time like 18:30" };
  if (start === end) return { error: "In and Out cannot be the same time" };
  return { shift: { name, in: start, out: end } };
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const nameTaken = (name, notId) =>
  ShiftType.exists({ name: { $regex: `^${escape(name)}$`, $options: "i" }, ...(notId && { _id: { $ne: notId } }) });

const router = express.Router();
router.use(isLoggedIn);

router.get("/", allowed("employees.view", "employees.add"), async (req, res, next) => {
  try {
    const rows = await ShiftType.find({}, { name: 1, in: 1, out: 1 }).sort({ in: 1, name: 1 }).lean();
    res.json(rows.map(shape));
  } catch (error) {
    next(error);
  }
});

router.post("/", allowed("employees.add"), async (req, res, next) => {
  try {
    const { shift, error } = readBody(req.body);
    if (error) return res.status(400).json({ message: error });
    if (await nameTaken(shift.name)) return res.status(409).json({ message: `A shift named ${shift.name} already exists` });
    if (await ShiftType.exists({ in: shift.in, out: shift.out })) {
      return res.status(409).json({ message: `A shift with ${shift.in}-${shift.out} already exists` });
    }
    const user = await User.findById(req.session.userId, { username: 1 }).lean();
    const created = await ShiftType.create({ ...shift, addedBy: user?.username || "" });
    res.status(201).json(shape(created));
  } catch (error) {
    next(error);
  }
});

router.put("/:id", allowed("employees.add"), async (req, res, next) => {
  try {
    const { shift, error } = readBody(req.body);
    if (error) return res.status(400).json({ message: error });
    const old = await ShiftType.findById(req.params.id);
    if (!old) return res.status(404).json({ message: "Shift not found" });
    if (await nameTaken(shift.name, old._id)) return res.status(409).json({ message: `A shift named ${shift.name} already exists` });
    if (await ShiftType.exists({ in: shift.in, out: shift.out, _id: { $ne: old._id } })) {
      return res.status(409).json({ message: `A shift with ${shift.in}-${shift.out} already exists` });
    }
    let moved = 0;
    const timesChanged = old.in !== shift.in || old.out !== shift.out;
    if (timesChanged && req.body?.moveEmployees) {
      const result = await EmployeeProfile.updateMany(
        { "shift.in": old.in, "shift.out": old.out },
        { $set: { shift: { in: shift.in, out: shift.out } } }
      );
      moved = result.modifiedCount || 0;
      if (moved) clearShiftCache();
    }
    Object.assign(old, shift);
    await old.save();
    res.json({ ...shape(old), moved });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", allowed("employees.add"), async (req, res, next) => {
  try {
    await ShiftType.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
