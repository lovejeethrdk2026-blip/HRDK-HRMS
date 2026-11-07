import express from "express";
import {
  createDepartment,
  createSubDepartment,
  deleteDepartment,
  deleteSubDepartment,
  listDepartments
} from "./department.controller.js";

const router = express.Router();

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
