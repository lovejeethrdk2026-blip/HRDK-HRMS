import express from "express";
import { isLoggedIn } from "../middleware/auth.js";
import { accessFor } from "../roles/roles.controller.js";
import Holiday from "./models/Holiday.js";
import User from "../users/models/User.js";

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

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const router = express.Router();
router.use(isLoggedIn);

// GET /api/holidays?year=2026 -> [{ _id, date, name }], oldest first; every
// year when year is left out. Month Shift Pay reads it too.
router.get("/", allowed("holidays.view", "holidays.manage", "paysheet.monthpay"), async (req, res, next) => {
  try {
    const year = /^\d{4}$/.test(String(req.query.year ?? "")) ? req.query.year : "";
    const filter = year ? { date: { $regex: `^${year}-` } } : {};
    res.json(await Holiday.find(filter, { date: 1, name: 1 }).sort({ date: 1 }).lean());
  } catch (error) {
    next(error);
  }
});

// POST /api/holidays { date: "YYYY-MM-DD", name } -> the new holiday.
router.post("/", allowed("holidays.manage"), async (req, res, next) => {
  try {
    const date = String(req.body?.date ?? "").trim();
    const name = String(req.body?.name ?? "").trim();
    if (!DATE.test(date) || !name) return res.status(400).json({ message: "Pick a date and type the holiday name" });
    if (await Holiday.exists({ date })) return res.status(409).json({ message: `${date} is already a holiday` });
    const holiday = await Holiday.create({ date, name, addedBy: (await User.findById(req.session.userId, { username: 1 }).lean())?.username || "" });
    res.status(201).json({ _id: holiday._id, date, name });
  } catch (error) {
    next(error);
  }
});

// PUT /api/holidays/:id { name } -> renames it.
router.put("/:id", allowed("holidays.manage"), async (req, res, next) => {
  try {
    const name = String(req.body?.name ?? "").trim();
    if (!name) return res.status(400).json({ message: "Type the holiday name" });
    const holiday = await Holiday.findByIdAndUpdate(req.params.id, { name }, { new: true }).lean();
    if (!holiday) return res.status(404).json({ message: "Holiday not found" });
    res.json({ _id: holiday._id, date: holiday.date, name: holiday.name });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/holidays/:id
router.delete("/:id", allowed("holidays.manage"), async (req, res, next) => {
  try {
    await Holiday.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
