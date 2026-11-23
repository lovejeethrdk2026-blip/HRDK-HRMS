import { useRef, useState } from "react";
import api, { API_URL } from "../api/axios";

// Add Employee > Documents: the employee's PDF / JPG / PNG files. Picked files
// wait in `pending` until the form is saved (a new employee has no record to
// attach them to before that); AddEmployee then sends them with
// uploadDocuments(). Saved files (when editing) open, download or delete
// straight away. Server side: server/employee/employeeDocuments.js.

// Upload slots, shown in these groups.
export const DOCUMENT_GROUPS = [
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
    // Parents' papers (ESIC family cover, PF nomination). No apostrophes: the
    // server strips them from titles, and the saved title must match this list.
    heading: "Father & mother documents",
    titles: [
      "Father Aadhaar card",
      "Mother Aadhaar card",
      "Father PAN card",
      "Mother PAN card",
      "Father photo",
      "Mother photo"
    ]
  }
];

export const DOCUMENT_TITLES = DOCUMENT_GROUPS.flatMap((group) => group.titles);

// Papers every employee must have before the form saves (AddEmployee checks
// missingKyc). Empty: no document is required. Add titles here to require them.
export const KYC_TITLES = [];

// KYC titles with no file among the saved and picked documents.
export const missingKyc = (saved, pending) =>
  KYC_TITLES.filter((title) => ![...saved, ...pending].some((doc) => doc.title === title));

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const EXCEL_EXTS = [".xlsx", ".xls"];
const MAX_BYTES = 10 * 1024 * 1024;

// ".xlsx" / ".xls" / "" from a file name.
const extOfName = (name) => (/\.[^.]+$/.exec(String(name || "").toLowerCase()) || [""])[0];
const isExcel = (name) => EXCEL_EXTS.includes(extOfName(name));

// PDF / JPG / PNG by type, Excel by name (Windows often gives an Excel file no
// type, or a different one). The server checks the content as well.
const allowedFile = (file) => ALLOWED_TYPES.includes(file.type) || isExcel(file.name);

const sizeText = (bytes) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

// Same as folderNameOf / titleWords in server/drive/googleDrive.js.
const words = (text) => String(text || "").split(/[^A-Za-z0-9]+/).filter(Boolean);
const upperWords = (text) => words(text).map((word) => word.toUpperCase()).join("_"); // "RISHIKA_SONI"
const titleWords = (text) => words(text).map((word) => word[0].toUpperCase() + word.slice(1)).join("_"); // "Bank_Passbook_Cheque"

// What the server will call the file: 10001_RISHIKA_SONI_Aadhaar_Card.pdf.
const savedName = (code, name, title, file) => {
  const ext = isExcel(file.name)
    ? extOfName(file.name)
    : file.type === "application/pdf" ? ".pdf" : file.type === "image/png" ? ".png" : ".jpg";
  return [code || "Code", upperWords(name) || "NAME", titleWords(title) || "Document"].join("_") + ext;
};

const fileUrl = (employeeId, doc, download) =>
  `${API_URL}/employees/${encodeURIComponent(employeeId)}/documents/${doc.id}${download ? "?download=1" : ""}`;

// Sends each pending file; returns { uploaded: [document], failed: ["name: why"] }.
export async function uploadDocuments(employeeId, pending) {
  const uploaded = [];
  const failed = [];
  for (const { title, file } of pending) {
    try {
      const { data } = await api.post(`/employees/${encodeURIComponent(employeeId)}/documents`, file, {
        params: { title, fileName: file.name },
        headers: { "Content-Type": file.type || "application/octet-stream" }
      });
      uploaded.push(data);
    } catch (err) {
      failed.push(`${file.name}: ${err.response?.data?.message || err.message}`);
    }
  }
  return { uploaded, failed };
}

// Joins every document (saved and picked) into one PDF, in DOCUMENT_TITLES
// order: PDFs are copied page by page, JPG / PNG go on their own A4 page with
// the document name on top. An Excel file can't be put in a PDF: it gets a
// page naming it, to open on its own. A file that cannot be read gets a page
// saying so.
async function buildCombinedPdf(employeeId, saved, pending) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const order = (title) => DOCUMENT_TITLES.indexOf(slotOf(title));
  const items = [
    ...saved.map((doc) => ({
      title: doc.title,
      name: doc.fileName,
      type: doc.mimeType,
      read: async () =>
        (
          await api.get(`/employees/${encodeURIComponent(employeeId)}/documents/${doc.id}`, {
            responseType: "arraybuffer"
          })
        ).data
    })),
    ...pending.map((item) => ({
      title: item.title,
      name: item.file.name,
      type: item.file.type,
      read: () => item.file.arrayBuffer()
    }))
  ].sort((a, b) => order(a.title) - order(b.title));

  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.HelveticaBold);
  const A4 = [595.28, 841.89];
  const MARGIN = 18; // small edge so every document uses nearly the full page width
  const HEAD = 22; // room for the document name at the top
  const clean = (text) => text.replace(/[^ -~]/g, "?");
  const notePage = (text) => {
    const page = out.addPage(A4);
    page.drawText(clean(text), { x: MARGIN, y: A4[1] - MARGIN - 14, size: 13, font, color: rgb(0.7, 0.1, 0.1) });
  };
  // New A4 page with the name on top; draws `thing` (image or embedded page)
  // as wide as the page allows, keeping its shape.
  const placeOnA4 = (thing, w0, h0, label, isPage) => {
    const page = out.addPage(A4);
    page.drawText(clean(label), { x: MARGIN, y: A4[1] - MARGIN - 10, size: 10, font });
    const boxW = A4[0] - MARGIN * 2;
    const boxH = A4[1] - MARGIN * 2 - HEAD;
    const scale = Math.min(boxW / w0, boxH / h0);
    const w = w0 * scale;
    const h = h0 * scale;
    const at = { x: (A4[0] - w) / 2, y: MARGIN + (boxH - h), width: w, height: h };
    if (isPage) page.drawPage(thing, at);
    else page.drawImage(thing, at);
  };

  for (const item of items) {
    const label = `${item.title} - ${item.name}`;
    if (isExcel(item.name)) {
      const page = out.addPage(A4);
      page.drawText(clean(`${label}`), { x: MARGIN, y: A4[1] - MARGIN - 14, size: 13, font });
      page.drawText("Excel file: not shown in this PDF. Open or download it from the Documents list.", {
        x: MARGIN,
        y: A4[1] - MARGIN - 36,
        size: 10,
        font,
        color: rgb(0.35, 0.35, 0.35)
      });
      continue;
    }
    try {
      const bytes = await item.read();
      if (item.type === "application/pdf") {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const count = src.getPageCount();
        for (let i = 0; i < count; i += 1) {
          const pageLabel = count > 1 ? `${label} (page ${i + 1} of ${count})` : label;
          // pdf-lib only fails an embed when the file is saved, so try it on a
          // scratch file first; a page that will not embed is copied as it is.
          let fits = true;
          try {
            const probe = await PDFDocument.create();
            const [test] = await probe.embedPdf(src, [i]);
            await test.embed();
          } catch {
            fits = false;
          }
          if (fits) {
            const [embedded] = await out.embedPdf(src, [i]);
            placeOnA4(embedded, embedded.width, embedded.height, pageLabel, true);
          } else {
            const [copied] = await out.copyPages(src, [i]);
            out.addPage(copied);
          }
        }
      } else {
        const img = item.type === "image/png" ? await out.embedPng(bytes) : await out.embedJpg(bytes);
        placeOnA4(img, img.width, img.height, label);
      }
    } catch {
      notePage(`Could not add ${label}`);
    }
  }
  return out.save();
}

// Which slot a document shows under: its own title, or "Other" for titles not
// in DOCUMENT_TITLES (older uploads).
const slotOf = (title) => (DOCUMENT_TITLES.includes(title) ? title : "Other");

export default function EmployeeDocuments({ employeeId, employeeCode, employeeName, saved, onSavedChange, pending, onPendingChange }) {
  const [problem, setProblem] = useState("");
  const [deleting, setDeleting] = useState("");
  const inputRefs = useRef({});
  const [combining, setCombining] = useState(false);
  const total = saved.length + pending.length;

  async function downloadAll() {
    setCombining(true);
    setProblem("");
    try {
      const bytes = await buildCombinedPdf(employeeId, saved, pending);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = [employeeCode || "Code", upperWords(employeeName) || "NAME", "Documents"].join("_") + ".pdf";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      setProblem(`Could not make the PDF: ${err.message}`);
    } finally {
      setCombining(false);
    }
  }

  function addFiles(title, files) {
    const bad = [];
    const added = [];
    for (const file of files) {
      if (!allowedFile(file)) bad.push(`${file.name} is not a PDF, JPG, PNG or Excel file`);
      else if (file.size > MAX_BYTES) bad.push(`${file.name} is over 10 MB`);
      else added.push({ key: `${Date.now()}-${Math.random()}`, title, file });
    }
    setProblem(bad.join(". "));
    if (added.length) onPendingChange([...pending, ...added]);
    if (inputRefs.current[title]) inputRefs.current[title].value = "";
  }

  async function remove(doc) {
    if (!window.confirm(`Delete ${doc.title} (${doc.fileName})?`)) return;
    setDeleting(doc.id);
    setProblem("");
    try {
      await api.delete(`/employees/${encodeURIComponent(employeeId)}/documents/${doc.id}`);
      onSavedChange(saved.filter((d) => d.id !== doc.id));
    } catch (err) {
      setProblem(err.response?.data?.message || err.message);
    } finally {
      setDeleting("");
    }
  }

  const docRow = (doc) => (
    <li key={doc.id} className="ae-doc">
      <span className="ae-doc-badge">{doc.mimeType === "application/pdf" ? "PDF" : "IMG"}</span>
      <span className="ae-doc-text">
        <span className="ae-doc-meta">
          {doc.fileName} · {sizeText(doc.size)}
        </span>
      </span>
      <a className="btn" href={fileUrl(employeeId, doc)} target="_blank" rel="noreferrer">
        View
      </a>
      <a className="btn" href={fileUrl(employeeId, doc, true)}>
        Download
      </a>
      <button type="button" className="btn" disabled={deleting === doc.id} onClick={() => remove(doc)}>
        {deleting === doc.id ? "Deleting…" : "Delete"}
      </button>
    </li>
  );

  const pendingRow = (item) => (
    <li key={item.key} className="ae-doc is-pending">
      <span className="ae-doc-badge">{item.file.type === "application/pdf" ? "PDF" : "IMG"}</span>
      <span className="ae-doc-text">
        <span className="ae-doc-meta" title={item.file.name}>
          {item.file.name} · {sizeText(item.file.size)} · saves as{" "}
          {savedName(employeeCode, employeeName, item.title, item.file)}
        </span>
      </span>
      <button type="button" className="btn" onClick={() => onPendingChange(pending.filter((p) => p.key !== item.key))}>
        Remove
      </button>
    </li>
  );

  return (
    <div className="ae-docs">
      <div className="ae-docs-top">
        <p className="ae-docs-hint">PDF, JPG, PNG or Excel (.xlsx, .xls), up to 10 MB each.</p>
        <button type="button" className="btn" disabled={!total || combining} onClick={downloadAll}>
          {combining ? "Making PDF…" : `Download all as one PDF${total ? ` (${total})` : ""}`}
        </button>
      </div>
      {problem && (
        <p className="ae-docs-problem" role="alert">
          {problem}
        </p>
      )}
      {DOCUMENT_GROUPS.map((group) => (
      <section key={group.heading} className="ae-slot-group">
      <h3 className="ae-salary-title">{group.heading}</h3>
      <div className="ae-slots">
        {group.titles.map((title) => {
          const required = KYC_TITLES.includes(title);
          const slotSaved = saved.filter((d) => slotOf(d.title) === title);
          const slotPending = pending.filter((p) => slotOf(p.title) === title);
          const count = slotSaved.length + slotPending.length;
          const inputId = `ae-doc-${titleWords(title)}`;
          return (
            <div key={title} className={`ae-slot${count ? " has-file" : required ? " is-missing" : ""}`}>
              <div className="ae-slot-head">
                <span className="ae-slot-title">
                  {title}
                  {required && <span className="field-required"> *</span>}
                </span>
                <span className="ae-slot-status">
                  {count ? `✓ ${count} file${count > 1 ? "s" : ""}` : required ? "Missing" : ""}
                </span>
                <input
                  id={inputId}
                  ref={(el) => (inputRefs.current[title] = el)}
                  className="ae-slot-input"
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  onChange={(e) => addFiles(title, Array.from(e.target.files || []))}
                />
                <label htmlFor={inputId} className="btn ae-slot-btn">
                  {count ? "Add more" : "Upload"}
                </label>
              </div>
              {count > 0 && (
                <ul className="ae-docs-list">
                  {slotSaved.map(docRow)}
                  {slotPending.map(pendingRow)}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      </section>
      ))}
    </div>
  );
}
