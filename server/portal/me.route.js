import express from "express";
import {
  applyMyLeave,
  attendance,
  cancelMyLeave,
  documentLink,
  documents,
  leave,
  login,
  logout,
  payslip,
  payslips,
  profile,
  requireEmployee
} from "./me.controller.js";
import { correctDetails, getDetails, uploadMyDocument } from "./profile.js";
import { myChat, myUnread, sendMyMessage } from "../chat/chat.js";
import { MAX_DOCUMENT_BYTES } from "../employee/employeeDocuments.js";

// Employee app (HRDK-EMP-APP) API: /api/me/... Everything after login works on
// the logged-in employee only (me.controller.js).
const router = express.Router();

router.post("/auth/login", login);
router.post("/auth/logout", logout);

router.use(requireEmployee);
router.get("/profile", profile);
router.get("/profile/details", getDetails); // full profile + what is missing
router.put("/profile/details", correctDetails); // one-time correction
router.post("/documents", express.raw({ type: () => true, limit: MAX_DOCUMENT_BYTES }), uploadMyDocument);
router.get("/chat", myChat); // chat with my manager (HR can read and answer too)
router.post("/chat", sendMyMessage);
router.get("/chat/unread", myUnread);
router.get("/attendance", attendance);
router.get("/leave", leave);
router.post("/leave", applyMyLeave);
router.post("/leave/:id/cancel", cancelMyLeave);
router.get("/payslips", payslips);
router.get("/payslips/:month", payslip);
router.get("/documents", documents);
router.get("/documents/:id/link", documentLink);

export default router;
