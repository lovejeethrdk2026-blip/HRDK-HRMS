import express from "express";
import { listRoles, createRole, updateRole } from "./roles.controller.js";
import { isLoggedIn, authorize } from "../middleware/auth.js";

const router = express.Router();

// Roles & Permissions page: admin only
router.get("/", isLoggedIn, authorize("admin"), listRoles);
router.post("/", isLoggedIn, authorize("admin"), createRole);
router.put("/:name", isLoggedIn, authorize("admin"), updateRole);

export default router;
