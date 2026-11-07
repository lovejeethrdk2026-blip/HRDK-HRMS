import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmployeeProfile from "./models/EmployeeProfile.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Employee documents (Add Employee > Documents): PDF / JPG / PNG files kept on
// disk under server/uploads/employees/<employeeId>/ as
// EmpCode_EmpName_DocName.pdf, listed in the employee's
// `documents` array. One file per request, sent as the raw request body.

const UPLOAD_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "uploads", "employees");
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

// Allowed kinds, checked by the file's first bytes (not just its name).
const KINDS = [
  { mimeType: "application/pdf", ext: ".pdf", magic: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { mimeType: "image/png", ext: ".png", magic: [0x89, 0x50, 0x4e, 0x47] },
  { mimeType: "image/jpeg", ext: ".jpg", magic: [0xff, 0xd8, 0xff] }
];

const kindOf = (buffer) => KINDS.find((kind) => kind.magic.every((byte, i) => buffer[i] === byte));

const folderOf = (employeeId) => path.join(UPLOAD_ROOT, employeeId.replace(/[^A-Za-z0-9_-]/g, "_"));

// Strips path parts and odd characters from a name the browser sent.
function cleanName(name, fallback) {
  const base = path.basename(String(name || "")).replace(/[^\w .()-]/g, "").trim();
  return (base || fallback).slice(0, 120);
}

// "Ramesh kumar" -> "RameshKumar", "Bank passbook / cheque" -> "BankPassbookCheque":
// one word per part, so "_" only ever splits code, name and document name.
export function namePart(text) {
  return String(text || "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join("");
}

// The saved file's name: EmpCode_EmpName_DocName.pdf, with _2, _3 ... when the
// employee already has a file by that name (two "Other" documents, say).
function savedNameOf(employee, title, ext) {
  const base = [employee.employeeId, namePart(employee.name), namePart(title) || "Document"].join("_");
  const taken = new Set(employee.documents.map((doc) => doc.fileName.toLowerCase()));
  let name = base + ext;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base}_${n}${ext}`;
  return name;
}

async function findEmployee(req, res) {
  const employee = await EmployeeProfile.findOne({ employeeId: req.params.employeeId });
  if (!employee) res.status(404).json({ message: `Employee ${req.params.employeeId} not found` });
  return employee;
}

// POST /api/employees/:employeeId/documents?title=..&fileName=..
// Body: the file's bytes. Returns the saved document entry.
async function uploadDocument(req, res) {
  const buffer = Buffer.isBuffer(req.body) ? req.body : null;
  if (!buffer || !buffer.length) return res.status(400).json({ message: "No file received" });
  const kind = kindOf(buffer);
  if (!kind) return res.status(400).json({ message: "Only PDF, JPG or PNG files can be uploaded" });

  const employee = await findEmployee(req, res);
  if (!employee) return;

  // Not cleanName: a title such as "Bank passbook / cheque" keeps its "/".
  const title = String(req.query.title || "").replace(/[^\w ./()-]/g, "").trim().slice(0, 60) || "Document";
  const fileName = savedNameOf(employee, title, kind.ext);
  const folder = folderOf(employee.employeeId);
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, fileName), buffer, { flag: "wx" });

  const document = {
    id: randomUUID(),
    title,
    fileName, // also its name on disk
    originalName: cleanName(req.query.fileName, `document${kind.ext}`),
    mimeType: kind.mimeType,
    size: buffer.length,
    uploadedAt: new Date()
  };
  employee.documents.push(document);
  await employee.save();
  res.status(201).json(document);
}

function documentOf(employee, req, res) {
  const document = employee.documents.find((doc) => doc.id === req.params.documentId);
  if (!document) res.status(404).json({ message: "Document not found" });
  return document;
}

const fileOf = (employee, document) => path.join(folderOf(employee.employeeId), path.basename(document.fileName));

// GET /api/employees/:employeeId/documents/:documentId  Opens the file in the
// browser (?download=1 saves it instead).
async function getDocument(req, res) {
  const employee = await findEmployee(req, res);
  if (!employee) return;
  const document = documentOf(employee, req, res);
  if (!document) return;
  const disposition = req.query.download ? "attachment" : "inline";
  res.setHeader("Content-Type", document.mimeType);
  res.setHeader("Content-Disposition", `${disposition}; filename="${document.fileName.replace(/"/g, "")}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.sendFile(fileOf(employee, document), (error) => {
    if (error && !res.headersSent) res.status(404).json({ message: "File missing on server" });
  });
}

// DELETE /api/employees/:employeeId/documents/:documentId
async function deleteDocument(req, res) {
  const employee = await findEmployee(req, res);
  if (!employee) return;
  const document = documentOf(employee, req, res);
  if (!document) return;
  await fs.rm(fileOf(employee, document), { force: true });
  employee.documents = employee.documents.filter((doc) => doc.id !== document.id);
  await employee.save();
  res.json({ ok: true });
}

const uploadDocumentHandler = asyncHandler(uploadDocument);
const getDocumentHandler = asyncHandler(getDocument);
const deleteDocumentHandler = asyncHandler(deleteDocument);

export {
  uploadDocumentHandler as uploadDocument,
  getDocumentHandler as getDocument,
  deleteDocumentHandler as deleteDocument
};
