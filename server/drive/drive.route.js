import { randomBytes } from "node:crypto";
import express from "express";
import { authorize, isLoggedIn } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { authUrl, disconnect, driveStatus, finishConnect } from "./googleDrive.js";
import { moveStatus, startMoveToDrive } from "../employee/employeeDocuments.js";

// Google Drive connection, managed by an admin on the Users page.
const router = express.Router();

// GET /api/drive/status  { configured, missing, connected, email, move }
router.get(
  "/status",
  isLoggedIn,
  asyncHandler(async (req, res) => {
    res.json({ ...(await driveStatus()), move: moveStatus() });
  })
);

// GET /api/drive/connect  Sends the admin to Google's "Allow" page.
router.get("/connect", isLoggedIn, authorize("admin"), (req, res) => {
  const state = randomBytes(16).toString("hex");
  req.session.driveState = state;
  // Back to the page they came from (dev server 5173 or this server).
  let back = "/";
  try {
    const referer = new URL(req.get("referer") || "");
    if (["localhost", "127.0.0.1", req.hostname].includes(referer.hostname)) back = referer.origin + "/";
  } catch {
    /* no referer: this server's own "/" */
  }
  req.session.driveReturn = back;
  req.session.save(() => res.redirect(authUrl(state)));
});

// GET /api/drive/callback  Google sends the admin back here (GOOGLE_REDIRECT_URI).
router.get(
  "/callback",
  asyncHandler(async (req, res) => {
    const back = req.session.driveReturn || "/";
    const done = (result) => res.redirect(`${back}?drive=${encodeURIComponent(result)}`);
    const expected = req.session.driveState;
    delete req.session.driveState;
    if (!req.session.userId || req.session.role !== "admin") return done("error:Please login as admin first");
    if (req.query.error) return done(`error:${req.query.error}`);
    if (!expected || req.query.state !== expected) return done("error:Link expired, click Connect again");
    try {
      await finishConnect(String(req.query.code || ""));
      done("connected");
    } catch (error) {
      done(`error:${error.message}`);
    }
  })
);

// POST /api/drive/disconnect
router.post(
  "/disconnect",
  isLoggedIn,
  authorize("admin"),
  asyncHandler(async (req, res) => {
    await disconnect();
    res.json({ ok: true });
  })
);

// POST /api/drive/move  Copies documents still on this PC into Drive (background).
router.post(
  "/move",
  isLoggedIn,
  authorize("admin"),
  asyncHandler(async (req, res) => {
    if (!(await driveStatus()).connected) return res.status(400).json({ message: "Connect Google Drive first" });
    startMoveToDrive();
    res.json(moveStatus());
  })
);

export default router;
