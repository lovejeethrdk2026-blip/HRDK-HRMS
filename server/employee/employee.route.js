import express from "express";
import {
  createEmployee,
  exitEmployee,
  listEmployees,
  rejoinEmployee,
  reviseSalary,
  transferDepartment,
  transferEmployee,
  undoExit,
  updateEmployee
} from "./employee.controller.js";
import { getSalarySheet } from "./salarySheet.js";
import { MAX_DOCUMENT_BYTES, deleteDocument, getDocument, uploadDocument } from "./employeeDocuments.js";

const router = express.Router();

// Employees page.
router.get("/", listEmployees);
// Employees page > Download salary sheet: pay by Daily Register days, ?month=YYYY-MM.
router.get("/salary-sheet", getSalarySheet);
// Add Employee page.
router.post("/", createEmployee);
// Edit button on an Employees card.
router.put("/:employeeId", updateEmployee);
// Transfer button on an Employees card: move to another state.
router.post("/:employeeId/transfer", transferEmployee);
// Department transfer button on an Employees card.
router.post("/:employeeId/department-transfer", transferDepartment);
// Salary revision button on an Employees card: a new CTC with no transfer.
router.post("/:employeeId/salary-revision", reviseSalary);
// Exit button on an Employees card: they left (record kept, histories closed).
router.post("/:employeeId/exit", exitEmployee);
// Rejoin button on a left employee's card: same code, histories open again.
router.post("/:employeeId/rejoin", rejoinEmployee);
// Undo exit button: an exit entered by mistake.
router.post("/:employeeId/undo-exit", undoExit);
// Add Employee > Documents: PDF / JPG / PNG files, one per request as the raw body.
router.post(
  "/:employeeId/documents",
  express.raw({ type: () => true, limit: MAX_DOCUMENT_BYTES }),
  uploadDocument
);
router.get("/:employeeId/documents/:documentId", getDocument);
router.delete("/:employeeId/documents/:documentId", deleteDocument);

export default router;
