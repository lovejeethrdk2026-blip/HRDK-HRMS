import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmployeeProfile from "./models/EmployeeProfile.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  downloadFile,
  employeeFolder,
  folderNameOf,
  isConnected,
  renameFile,
  titleWords,
  trashFile,
  uploadFile
} from "../drive/googleDrive.js";

// Employee documents (Add Employee > Documents): PDF / JPG / PNG / Excel files, one per
// request as the raw request body, listed in the employee's `documents` array.
//
// Where the file goes:
//   Google Drive connected (Users page) -> hrdk-hrms/10001_RISHIKA_SONI/10001_RISHIKA_SONI_Aadhaar_Card.pdf
//   not connected                       -> server/uploads/employees/10001/<same name>
// A document with a driveFileId is in Drive; without one it is on disk.

const UPLOAD_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "uploads", "employees");
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

// Allowed kinds, checked by the file's first bytes (not just its name).
// Excel: .xlsx is a zip holding xl/ parts (a .docx is a zip too, so the name and
// the xl/ entry must both say Excel); .xls is an old Office (OLE) file with an
// .xls name.
const KINDS = [
  { mimeType: "application/pdf", ext: ".pdf", magic: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { mimeType: "image/png", ext: ".png", magic: [0x89, 0x50, 0x4e, 0x47] },
  { mimeType: "image/jpeg", ext: ".jpg", magic: [0xff, 0xd8, 0xff] },
  {
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ext: ".xlsx",
    magic: [0x50, 0x4b, 0x03, 0x04], // PK zip
    names: [".xlsx"],
    check: (buffer) => buffer.includes("xl/")
  },
  {
    mimeType: "application/vnd.ms-excel",
    ext: ".xls",
    magic: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], // OLE
    names: [".xls"]
  }
];

const kindOf = (buffer, fileName = "") => {
  const ext = path.extname(String(fileName)).toLowerCase();
  return KINDS.find(
    (kind) =>
      kind.magic.every((byte, i) => buffer[i] === byte) &&
      (!kind.names || kind.names.includes(ext)) &&
      (!kind.check || kind.check(buffer))
  );
};

const folderOf = (employeeId) => path.join(UPLOAD_ROOT, employeeId.replace(/[^A-Za-z0-9_-]/g, "_"));

// Strips path parts and odd characters from a name the browser sent.
function cleanName(name, fallback) {
  const base = path.basename(String(name || "")).replace(/[^\w .()-]/g, "").trim();
  return (base || fallback).slice(0, 120);
}

// The saved file's name: 10001_RISHIKA_SONI_Aadhaar_Card.pdf, with _2, _3 ...
// when the employee already has a file by that name (two "Other" documents, say).
function savedNameOf(employee, title, ext, skip = null) {
  const base = `${folderNameOf(employee)}_${titleWords(title) || "Document"}`;
  const taken = new Set(employee.documents.filter((doc) => doc !== skip).map((doc) => doc.fileName.toLowerCase()));
  let name = base + ext;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base}_${n}${ext}`;
  return name;
}

const extOf = (document) => path.extname(document.fileName) || KINDS.find((k) => k.mimeType === document.mimeType)?.ext || "";

async function findEmployee(req, res) {
  const employee = await EmployeeProfile.findOne({ employeeId: req.params.employeeId });
  if (!employee) res.status(404).json({ message: `Employee ${req.params.employeeId} not found` });
  return employee;
}

// Checks the request's file and saves it (Drive or disk) as one of the
// employee's documents. Does not save the employee record. Returns
// { document } or { error } (a message for a 400 answer).
export async function storeDocument(employee, req) {
  const buffer = Buffer.isBuffer(req.body) ? req.body : null;
  if (!buffer || !buffer.length) return { error: "No file received" };
  const kind = kindOf(buffer, req.query.fileName);
  if (!kind) return { error: "Only PDF, JPG, PNG or Excel (.xlsx, .xls) files can be uploaded" };

  // Not cleanName: a title such as "Bank passbook / cheque" keeps its "/".
  const title = String(req.query.title || "").replace(/[^\w ./()-]/g, "").trim().slice(0, 60) || "Document";
  const fileName = savedNameOf(employee, title, kind.ext);

  let driveFileId = "";
  if (await isConnected()) {
    const folderId = await employeeFolder(employee);
    driveFileId = await uploadFile({ name: fileName, mimeType: kind.mimeType, buffer, folderId });
  } else {
    const folder = folderOf(employee.employeeId);
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(path.join(folder, fileName), buffer, { flag: "wx" });
  }

  const document = {
    id: randomUUID(),
    title,
    fileName,
    driveFileId,
    originalName: cleanName(req.query.fileName, `document${kind.ext}`),
    mimeType: kind.mimeType,
    size: buffer.length,
    uploadedAt: new Date()
  };
  employee.documents.push(document);
  return { document: employee.documents[employee.documents.length - 1] };
}

// POST /api/employees/:employeeId/documents?title=..&fileName=..
// Body: the file's bytes. Returns the saved document entry.
async function uploadDocument(req, res) {
  const employee = await findEmployee(req, res);
  if (!employee) return;
  const { document, error } = await storeDocument(employee, req);
  if (error) return res.status(400).json({ message: error });
  await employee.save();
  res.status(201).json(document);
}

// Deletes a document's file: Drive's bin (restorable 30 days) or off the disk.
// A file already gone is not an error. Does not touch the record.
export async function removeDocumentFile(employee, document) {
  if (document.driveFileId) await trashFile(document.driveFileId);
  else await fs.rm(fileOf(employee, document), { force: true });
}

// After the employee changed a document from the app (portal/profile.js):
// removes the older files of that title and gives the new one the plain name
// (10001_RISHIKA_SONI_Aadhaar_Card.pdf rather than ..._2.pdf).
export async function replaceOlder(employee, newest) {
  const older = employee.documents.filter((doc) => doc.title === newest.title && doc.id !== newest.id);
  for (const doc of older) await removeDocumentFile(employee, doc);
  const gone = new Set(older.map((doc) => doc.id));
  employee.documents = employee.documents.filter((doc) => !gone.has(doc.id));
  const doc = employee.documents.find((d) => d.id === newest.id);
  const name = savedNameOf(employee, doc.title, extOf(doc), doc);
  if (name === doc.fileName) return;
  try {
    if (doc.driveFileId) await renameFile(doc.driveFileId, name);
    else await fs.rename(fileOf(employee, doc), path.join(folderOf(employee.employeeId), name));
    doc.fileName = name;
  } catch (error) {
    console.error(`Rename of ${doc.fileName} failed:`, error.message); // keeps the _2 name
  }
}

// PUT /api/employees/:employeeId/documents-lock { title, locked }
// locked true: the employee can no longer change this document from the app.
async function setDocumentLock(req, res) {
  const employee = await findEmployee(req, res);
  if (!employee) return;
  const title = String(req.body?.title || "").trim();
  if (!title) return res.status(400).json({ message: "Which document?" });
  const update = req.body?.locked ? { $addToSet: { appLockedDocs: title } } : { $pull: { appLockedDocs: title } };
  const saved = await EmployeeProfile.findOneAndUpdate({ _id: employee._id }, update, { new: true });
  res.json({ appLockedDocs: saved.appLockedDocs });
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
  const headers = () => {
    res.setHeader("Content-Type", document.mimeType);
    res.setHeader("Content-Disposition", `${disposition}; filename="${document.fileName.replace(/"/g, "")}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
  };

  if (document.driveFileId) {
    const stream = await downloadFile(document.driveFileId);
    headers();
    stream.on("error", () => res.destroy());
    stream.pipe(res);
    return;
  }
  headers();
  res.sendFile(fileOf(employee, document), (error) => {
    if (error && !res.headersSent) res.status(404).json({ message: "File missing on server" });
  });
}

// DELETE /api/employees/:employeeId/documents/:documentId
// A Drive file goes to Drive's bin (restorable there for 30 days).
async function deleteDocument(req, res) {
  const employee = await findEmployee(req, res);
  if (!employee) return;
  const document = documentOf(employee, req, res);
  if (!document) return;
  await removeDocumentFile(employee, document);
  employee.documents = employee.documents.filter((doc) => doc.id !== document.id);
  await employee.save();
  res.json({ ok: true });
}

// After an employee's name changes: rename their Drive folder and every file
// in it to the new 10001_NEW_NAME prefix. Runs in the background; errors are
// logged, the employee record is already saved.
export async function renameInDrive(employee) {
  try {
    if (!employee.driveFolderId || !(await isConnected())) return;
    await renameFile(employee.driveFolderId, folderNameOf(employee));
    for (const document of employee.documents) {
      if (!document.driveFileId) continue;
      const name = savedNameOf(employee, document.title, extOf(document), document);
      if (name === document.fileName) continue;
      await renameFile(document.driveFileId, name);
      document.fileName = name;
    }
    await EmployeeProfile.updateOne(
      { _id: employee._id },
      { $set: { documents: employee.documents.map((doc) => (doc.toObject ? doc.toObject() : doc)) } }
    );
  } catch (error) {
    console.error(`Drive rename for ${employee.employeeId} failed:`, error.message);
  }
}

// ---- moving files already on this PC into Drive (Users page button) ----

const move = { running: false, total: 0, done: 0, failed: [], finishedAt: null };
export const moveStatus = () => ({ ...move, failed: move.failed.slice(0, 20), failedCount: move.failed.length });

// Uploads every on-disk document to Drive under the new name and points the
// record at it. The disk copies are left where they are, as a backup.
export function startMoveToDrive() {
  if (move.running) return false;
  Object.assign(move, { running: true, total: 0, done: 0, failed: [], finishedAt: null });
  (async () => {
    try {
      const employees = await EmployeeProfile.find({ "documents.0": { $exists: true } });
      const todo = employees.filter((emp) => emp.documents.some((doc) => !doc.driveFileId));
      move.total = todo.reduce((sum, emp) => sum + emp.documents.filter((doc) => !doc.driveFileId).length, 0);
      for (const employee of todo) {
        for (const document of employee.documents) {
          if (document.driveFileId) continue;
          try {
            const buffer = await fs.readFile(fileOf(employee, document));
            const folderId = await employeeFolder(employee);
            const name = savedNameOf(employee, document.title, extOf(document), document);
            document.driveFileId = await uploadFile({ name, mimeType: document.mimeType, buffer, folderId });
            document.fileName = name;
            await employee.save(); // after each file, so a crash loses nothing
          } catch (error) {
            move.failed.push(`${employee.employeeId} ${document.fileName}: ${error.message}`);
          }
          move.done++;
        }
      }
    } catch (error) {
      move.failed.push(error.message);
    } finally {
      move.running = false;
      move.finishedAt = new Date();
    }
  })();
  return true;
}

const uploadDocumentHandler = asyncHandler(uploadDocument);
const getDocumentHandler = asyncHandler(getDocument);
const deleteDocumentHandler = asyncHandler(deleteDocument);
const setDocumentLockHandler = asyncHandler(setDocumentLock);

export {
  setDocumentLockHandler as setDocumentLock,
  uploadDocumentHandler as uploadDocument,
  getDocumentHandler as getDocument,
  deleteDocumentHandler as deleteDocument
};
