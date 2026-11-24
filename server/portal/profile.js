import EmployeeProfile from "../employee/models/EmployeeProfile.js";
import { replaceOlder, storeDocument } from "../employee/employeeDocuments.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Employee app > My profile: the employee's own record as on the Add Employee
// form, what is missing, a one-time correction of their own personal /
// contact / address / bank details, and uploading their missing documents.
// The employee comes from the login key (me.controller.js requireEmployee).

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new HttpError(status, message);
};
const handle = (fn) =>
  asyncHandler(async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      if (error instanceof HttpError) return res.status(error.status).json({ message: error.message });
      throw error;
    }
  });

// Sections as on Add Employee. edit: the employee may correct it (once);
// rule: [pattern, message] as the admin form checks it; need: shown as missing
// when empty.
const SECTIONS = [
  {
    title: "Employee",
    fields: [
      { path: "employeeId", label: "Employee code" },
      { path: "initialsNo", label: "Matrix ID" },
      { path: "name", label: "Name" },
      { path: "department", label: "Department" },
      { path: "subDepartment", label: "Sub department" },
      { path: "designation", label: "Designation" },
      { path: "reportingManager", label: "Reporting manager" },
      { path: "joiningDate", label: "Date of joining" },
      { path: "employmentType", label: "Employment type" },
      { path: "uanNo", label: "UAN" },
      { path: "esicNo", label: "ESIC no." }
    ]
  },
  {
    title: "Personal",
    fields: [
      { path: "gender", label: "Gender", edit: true, need: true, options: ["Male", "Female", "Other"] },
      { path: "mobile", label: "Mobile", edit: true, need: true, rule: [/^\d{10}$/, "Mobile must be 10 digits"], keyboard: "phone-pad" },
      { path: "aadhaarNo", label: "Aadhaar no.", edit: true, need: true, rule: [/^\d{12}$/, "Aadhaar must be 12 digits"], keyboard: "number-pad" },
      { path: "pan", label: "PAN", edit: true, need: true, rule: [/^[A-Z]{5}[0-9]{4}[A-Z]$/, "PAN must look like ABCDE1234F"], upper: true },
      { path: "otherId.type", label: "Other ID type", edit: true, options: ["Voter ID", "Driving licence", "Ration card", "Passport"] },
      { path: "otherId.number", label: "Other ID no.", edit: true }
    ]
  },
  {
    title: "Emergency contact",
    fields: [
      { path: "emergencyContact.name", label: "Name", edit: true, need: true },
      { path: "emergencyContact.phone", label: "Phone", edit: true, need: true, rule: [/^\d{10}$/, "Emergency phone must be 10 digits"], keyboard: "phone-pad" },
      { path: "emergencyContact.relation", label: "Relation", edit: true, need: true }
    ]
  },
  {
    title: "Current address",
    fields: [
      { path: "address.line", label: "Address", edit: true, need: true, multiline: true },
      { path: "address.city", label: "City", edit: true, need: true },
      { path: "address.district", label: "District", edit: true },
      { path: "address.state", label: "State", edit: true, need: true },
      { path: "address.pin", label: "PIN code", edit: true, need: true, rule: [/^\d{6}$/, "PIN code must be 6 digits"], keyboard: "number-pad" }
    ]
  },
  {
    title: "Permanent address",
    fields: [
      { path: "permanentAddress.line", label: "Address", edit: true, multiline: true },
      { path: "permanentAddress.city", label: "City", edit: true },
      { path: "permanentAddress.state", label: "State", edit: true },
      { path: "permanentAddress.pin", label: "PIN code", edit: true, rule: [/^\d{6}$/, "Permanent PIN code must be 6 digits"], keyboard: "number-pad" }
    ]
  },
  {
    title: "Bank",
    fields: [
      { path: "bank.bankName", label: "Bank name", edit: true, need: true },
      { path: "bank.accountNo", label: "Account no.", edit: true, need: true, rule: [/^\d{6,18}$/, "Account number must be 6 to 18 digits"], keyboard: "number-pad" },
      { path: "bank.ifscCode", label: "IFSC", edit: true, need: true, rule: [/^[A-Z]{4}0[A-Z0-9]{6}$/, "IFSC must look like SBIN0001234"], upper: true }
    ]
  }
];

// Same upload slots as Add Employee > Documents (ADMIN EmployeeDocuments.jsx).
// important: shown as missing until uploaded.
const DOCUMENT_GROUPS = [
  {
    heading: "Personal documents",
    titles: [
      "Aadhaar card",
      "PAN card",
      "Bank passbook / cheque",
      "Photo",
      "10th marksheet",
      "12th marksheet",
      "UG marksheet",
      "PG marksheet",
      "Educational certificate",
      "Resume",
      "Offer letter",
      "Experience letter",
      "Other"
    ]
  },
  {
    heading: "Father & mother documents",
    titles: ["Father Aadhaar card", "Mother Aadhaar card", "Father PAN card", "Mother PAN card", "Father photo", "Mother photo"]
  }
];
const IMPORTANT_DOCS = new Set(["Aadhaar card", "PAN card", "Bank passbook / cheque", "Photo"]);
const ALL_TITLES = DOCUMENT_GROUPS.flatMap((group) => group.titles);

const get = (obj, path) => path.split(".").reduce((node, key) => (node == null ? undefined : node[key]), obj);
const FIELDS = SECTIONS.flatMap((section) => section.fields);
const EDITABLE = new Map(FIELDS.filter((f) => f.edit).map((f) => [f.path, f]));

async function profileOf(id) {
  return EmployeeProfile.findOne({ $or: [{ initialsNo: id }, { employeeId: id }] });
}

function details(p) {
  const corrected = Boolean(p.selfCorrection?.at);
  const sections = SECTIONS.map((section) => ({
    title: section.title,
    fields: section.fields.map(({ path, label, edit, need, options, keyboard, upper, multiline }) => {
      const value = String(get(p, path) ?? "");
      return {
        path,
        label,
        value: path === "bank.accountNo" && value.length > 4 ? `XXXX${value.slice(-4)}` : value,
        editable: Boolean(edit) && !corrected,
        missing: Boolean(need) && !value,
        ...(options && { options }),
        ...(keyboard && { keyboard }),
        ...(upper && { upper }),
        ...(multiline && { multiline })
      };
    })
  }));
  const documents = DOCUMENT_GROUPS.map((group) => ({
    heading: group.heading,
    items: group.titles.map((title) => {
      const files = (p.documents || []).filter((doc) => doc.title === title);
      const locked = (p.appLockedDocs || []).includes(title);
      return { title, uploaded: files.length, locked, important: IMPORTANT_DOCS.has(title) };
    })
  }));
  return {
    sections,
    documents,
    missingFields: sections.flatMap((s) => s.fields.filter((f) => f.missing).map((f) => `${s.title}: ${f.label}`)),
    missingDocuments: documents.flatMap((g) => g.items).filter((d) => d.important && !d.uploaded).map((d) => d.title),
    // How many things a complete profile has (required fields + important
    // documents), for the app's "profile complete" bar.
    required: FIELDS.filter((f) => f.need).length + IMPORTANT_DOCS.size,
    correction: { used: corrected, at: p.selfCorrection?.at || null }
  };
}

// GET /api/me/profile/details
export const getDetails = handle(async (req, res) => {
  const p = await profileOf(req.employeeId);
  if (!p) fail(404, "HR has not created your full profile yet. Ask HR.");
  res.json(details(p));
});

// PUT /api/me/profile/details { values: { "mobile": "98...", ... } }
// Once only: saves the employee's own corrections and keeps what changed
// (selfCorrection) so HR can see it on the profile record.
export const correctDetails = handle(async (req, res) => {
  const p = await profileOf(req.employeeId);
  if (!p) fail(404, "HR has not created your full profile yet. Ask HR.");
  if (p.selfCorrection?.at) fail(409, "You have already corrected your details once. Ask HR for further changes.");

  const values = req.body?.values && typeof req.body.values === "object" ? req.body.values : {};
  const changes = [];
  for (const [path, raw] of Object.entries(values)) {
    const field = EDITABLE.get(path);
    if (!field) fail(400, `${path} can't be changed from the app`);
    let value = String(raw ?? "").trim();
    if (field.upper) value = value.toUpperCase();
    if (path === "bank.accountNo" && /^XXXX\d{4}$/.test(value)) continue; // unchanged, still masked
    if (value && field.rule && !field.rule[0].test(value)) fail(400, field.rule[1]);
    if (value && field.options && !field.options.includes(value)) fail(400, `${field.label} must be one of ${field.options.join(", ")}`);
    const before = String(get(p, path) ?? "");
    if (before === value) continue;
    changes.push({ path, before, after: value });
    p.set(path, value);
  }
  if (!changes.length) fail(400, "Nothing changed");

  p.selfCorrection = { at: new Date(), changes };
  await p.save();
  res.json(details(p));
});

// POST /api/me/documents?title=..&fileName=.. (raw file body): uploads one of
// the employee's own documents, the same way Add Employee > Documents does.
// The employee may upload or change (replace) a document as often as they
// like until HR locks it on Add Employee > Documents. A change replaces the
// old file (Drive bin). There is no delete route here.
export const uploadMyDocument = handle(async (req, res) => {
  const p = await profileOf(req.employeeId);
  if (!p) fail(404, "HR has not created your full profile yet. Ask HR.");
  const title = String(req.query.title || "");
  if (!ALL_TITLES.includes(title)) fail(400, "Pick a document type");
  if ((p.appLockedDocs || []).includes(title)) fail(409, `${title} is locked by HR. To change it, ask HR.`);
  const hasFile = (p.documents || []).some((doc) => doc.title === title);

  const { document, error } = await storeDocument(p, req);
  if (error) fail(400, error);
  if (hasFile) await replaceOlder(p, document);
  await p.save();
  res.status(201).json(p.documents.find((doc) => doc.id === document.id));
});
