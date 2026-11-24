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
  payslipPdf,
  payslipPdfLink,
  payslips,
  profile,
  requireEmployee
} from "./me.controller.js";
import { correctDetails, getDetails, uploadMyDocument } from "./profile.js";
import { myChat, myUnread, sendMyMessage } from "../chat/chat.js";
import { MAX_DOCUMENT_BYTES } from "../employee/employeeDocuments.js";
import { requireFeature } from "../appSettings/appSettings.route.js";

// Employee app (HRDK-EMP-APP) API: /api/me/... Everything after login works on
// the logged-in employee only (me.controller.js).
const router = express.Router();

router.post("/auth/login", login);
router.post("/auth/logout", logout);
// Payslip PDF opened in the phone's browser: the signed 10-minute link from
// /payslips/:month/pdf-link stands in for the login key.
router.get("/payslip-pdf/:token", payslipPdf);

// Each feature can be switched off by HR (Employee App settings,
// appSettings/appSettings.route.js); a switched-off route answers 403.
router.use(requireEmployee);
router.get("/profile", profile);
router.get("/profile/details", getDetails); // full profile + what is missing
router.put("/profile/details", requireFeature("profileEdit"), correctDetails); // one-time correction
router.post("/documents", requireFeature("profileEdit"), express.raw({ type: () => true, limit: MAX_DOCUMENT_BYTES }), uploadMyDocument);
router.get("/chat", requireFeature("chat"), myChat); // chat with my manager (HR can read and answer too)
router.post("/chat", requireFeature("chat"), sendMyMessage);
router.get("/chat/unread", requireFeature("chat"), myUnread);
router.get("/attendance", requireFeature("attendance"), attendance);
router.get("/leave", requireFeature("leave"), leave);
router.post("/leave", requireFeature("leaveApply"), applyMyLeave);
router.post("/leave/:id/cancel", requireFeature("leaveApply"), cancelMyLeave);
router.get("/payslips", requireFeature("salary"), payslips);
router.get("/payslips/:month", requireFeature("salary"), payslip);
router.get("/payslips/:month/pdf-link", requireFeature("salary"), payslipPdfLink);
router.get("/documents", requireFeature("documents"), documents);
router.get("/documents/:id/link", requireFeature("documents"), documentLink);

export default router;
