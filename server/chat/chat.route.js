import express from "express";
import { getThread, listThreads, sendStaffMessage, unreadCount } from "./chat.js";

// ADMIN Messages page. Who sees which chats is decided in chat.js (staffOf):
// HR / admin every employee, a manager login only their own team.
const router = express.Router();

router.get("/threads", listThreads);
router.get("/unread", unreadCount);
router.get("/threads/:employeeId/messages", getThread);
router.post("/threads/:employeeId/messages", sendStaffMessage);

export default router;
