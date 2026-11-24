import express from "express";
import {
  createEmployee,
  exitEmployee,
  listEmployees,
  rejoinEmployee,
  reviseSalary,
  bulkReviseSalary,
  bulkTransferDepartment,
  bulkTransferState,
  bulkAssignShift,
  transferDepartment,
  transferEmployee,
  undoExit,
  updateEmployee
} from "./employee.controller.js";
import { getSalarySheet } from "./salarySheet.js";
import { MAX_DOCUMENT_BYTES, deleteDocument, getDocument, setDocumentLock, uploadDocument } from "./employeeDocuments.js";
import { isLoggedIn } from "../middleware/auth.js";
import { accessFor } from "../roles/roles.controller.js";

// Only a signed-in user whose role has this permission (admins always do).
const allowed = (permission) => async (req, res, next) => {
  try {
    const { permissions } = await accessFor(req.session.role);
    if (permissions.includes(permission)) return next();
    res.status(403).json({ message: "You are not allowed to do this" });
  } catch (error) {
    next(error);
  }
};

const router = express.Router();

// Everything here needs an HRMS sign-in: employee records hold Aadhaar, PAN,
// bank and salary, and this server is on the internet (Render).
router.use(isLoggedIn);

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
// Employees > Bulk increment: raise many employees' CTC by a % or an amount.
// Before "/:employeeId/..." routes would not clash, but kept here with the
// other salary routes. Signed in, with "Salary revision and transfers".
router.post("/bulk-salary-revision", isLoggedIn, allowed("employees.transfer"), bulkReviseSalary);
// Employees > Department change: move many employees to one department at once.
router.post("/bulk-department-transfer", isLoggedIn, allowed("employees.transfer"), bulkTransferDepartment);
// Employees > State change: move many employees to one state at once.
router.post("/bulk-state-transfer", isLoggedIn, allowed("employees.transfer"), bulkTransferState);
// Employees > Shift: give many employees one shift (in / out) at once.
router.post("/bulk-shift", isLoggedIn, allowed("employees.add"), bulkAssignShift);
// Exit button on an Employees card: they left (record kept, histories closed).
router.post("/:employeeId/exit", exitEmployee);
// Rejoin button on a left employee's card: same code, histories open again.
router.post("/:employeeId/rejoin", rejoinEmployee);
// Undo exit button: an exit entered by mistake.
router.post("/:employeeId/undo-exit", undoExit);
// Add Employee > Documents: PDF / JPG / PNG / Excel files, one per request as the raw body.
// Login required: these are Aadhaar / PAN / bank papers.
router.post(
  "/:employeeId/documents",
  isLoggedIn,
  express.raw({ type: () => true, limit: MAX_DOCUMENT_BYTES }),
  uploadDocument
);
router.get("/:employeeId/documents/:documentId", isLoggedIn, getDocument);
router.delete("/:employeeId/documents/:documentId", isLoggedIn, deleteDocument);
// Unlock / lock one document for the employee app (upload it again once).
router.put("/:employeeId/documents-lock", isLoggedIn, express.json(), setDocumentLock);

export default router;
