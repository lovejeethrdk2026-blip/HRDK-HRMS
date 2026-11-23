import express from "express";
import {
  createDepartment,
  createSubDepartment,
  deleteDepartment,
  deleteSubDepartment,
  listDepartments
} from "./department.controller.js";
import { isLoggedIn } from "../middleware/auth.js";

const router = express.Router();

// HRMS sign-in needed (this server is on the internet).
router.use(isLoggedIn);

// Department page: departments and their sub-departments, all added there.
router.get("/", listDepartments);
// "+ Add Department" dialog.
router.post("/", createDepartment);
// Delete button on a department.
router.delete("/:department", deleteDepartment);
// "+ Add Sub Department" inside an opened department.
router.post("/:department/sub-departments", createSubDepartment);
// Delete button on a sub-department.
router.delete("/:department/sub-departments/:sub", deleteSubDepartment);

export default router;
